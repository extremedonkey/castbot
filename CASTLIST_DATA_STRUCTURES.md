# CastBot Castlist Data Structures - Comprehensive Analysis

## Executive Summary

The CastBot castlist system is a hybrid implementation supporting both:
1. **New system (CastlistV3)**: Entity-based castlist configs stored in `playerData[guildId].castlistConfigs`
2. **Legacy system**: String-based castlist names stored directly on tribes
3. **Virtual adapter**: Layer that makes legacy castlists appear as real entities without migration

The system has three levels of castlist identification:
- **Legacy format**: `tribe.castlist` = string name (e.g., "production", "alumni")
- **Transitional format**: `tribe.castlistId` = single entity ID reference
- **Current format**: `tribe.castlistIds` = array of entity IDs (supports tribes in multiple castlists)

Key finding: **Users interact with the legacy system primarily; the new entity system exists but virtualization masks legacy data**.

---

## 1. Data Structures

### 1.1 Castlist Entity (castlistConfigs)

**Storage location**: `playerData[guildId].castlistConfigs[id]`

**Real entity structure**:
```javascript
{
  // Unique identifiers
  id: "castlist_1234567890_username",  // Format: castlist_[timestamp]_[createdBy]
                                        // Special: "default" for system default
  
  // Metadata
  name: "Alumni Placements",            // Display name
  type: "alumni_placements" | "custom" | "system" | "winners",
  description: "Winners from all seasons",
  emoji: "🏆",
  
  // Season integration
  seasonId: "unique-season-id" | null,  // Links to applicationConfigs[configId].seasonId
  
  // Timestamps
  createdAt: 1234567890,
  createdBy: "system" | "user_id",
  modifiedAt: 1234567890,               // Optional
  modifiedBy: "system" | "user_id",     // Optional
  
  // Configuration
  settings: {
    sortStrategy: "alphabetical" | "placements" | "custom",
    showRankings: true | false,
    maxDisplay: 25,
    visibility: "public" | "private"
  },
  
  // Optional
  metadata: {
    description: "...",
    emoji: "...",
    isDefault: true,                    // Only on default castlist
    migratedFrom: "virtual_xyz",        // Migration tracking
    migrationDate: 1234567890
  },
  
  // Type-specific (optional)
  rankings: {                           // Only if type includes rankings
    [userId]: { rank: 1, points: 100 }
  }
}
```

**Type definitions**:
- `alumni_placements`: Alumni placement rankings; emoji defaults to 🏆
- `custom`: User-created castlist; emoji defaults to 📋
- `system`: System-managed, can't be deleted; includes "default"
- `winners`: Cross-season winners; emoji defaults to 👑
- `legacy`: Internal marker for materialized virtual castlists

**Special case - Default castlist**:
- ID: `"default"` (not generated with timestamp)
- Type: `"system"`
- Name: `"Active Castlist"`
- Always exists (virtual or real)
- When materialized, becomes a real entity with ID "default"

---

### 1.2 Tribe Data Structure

**Storage location**: `playerData[guildId].tribes[roleId]`

**Tribe structure (mixed formats in use)**:
```javascript
{
  // Core identity
  // (roleId is the key, not stored in object)
  
  // Display
  emoji: "🤓" | null,
  
  // Castlist references (MULTIPLE FORMATS COEXIST)
  
  // Format 1: Legacy string (most common in production)
  castlist: "production" | "alumni" | "default" | null,
  
  // Format 2: Single ID reference (transitional)
  castlistId: "castlist_1234_user" | "default" | null,
  
  // Format 3: Multiple IDs (current/preferred)
  castlistIds: ["castlist_1234_user", "castlist_5678_user"] | null,
  
  // Legacy type field (on tribe, deprecated - moved to castlist entity)
  type: "alumni_placements" | undefined,
  
  // Legacy rankings field (on tribe, deprecated - moved to castlist entity)
  rankings: { [userId]: {...} } | undefined,
  
  // Legacy castlist field (string name, being phased out)
  castlist: "string_name" | undefined
}
```

**Actual data from backup**:
```javascript
{
  "1297206459301367914": {
    "emoji": null,
    "castlist": "production"
  },
  "1297199733718384744": {
    "emoji": null,
    "castlist": "carl"
  }
}
```

---

### 1.3 Virtual Castlist Entity

**Storage location**: Generated on-the-fly by `CastlistVirtualAdapter`

**Virtual entity structure** (mirrors real entity):
```javascript
{
  id: "virtual_base64encodedname",     // Generated from castlist name
  name: "production",                   // Original castlist string name
  type: "legacy",                       // Marked as virtual
  isVirtual: true,                      // FLAG for special handling
  
  // Virtual-specific field
  tribes: [roleId1, roleId2, ...],     // Computed by scanning all tribes
  
  createdAt: Date.now(),
  createdBy: "legacy_system",
  
  settings: {
    sortStrategy: "alphabetical" | "placements",
    showRankings: (type === "alumni_placements"),
    maxDisplay: 25,
    visibility: "public"
  },
  
  metadata: {
    description: "Legacy castlist: production",
    emoji: "🏆" | "📋" | ...           // Smart emoji selection based on name
  }
}
```

**Virtual ID encoding**:
- Format: `virtual_[base64urlsafe(castlistName)]`
- Example: "production" → "virtual_cHJvZHVjdGlvbg"
- Encoding replaces `+` → `-`, `/` → `_`, removes padding
- Decoded back with: `Buffer.from(normalBase64, 'base64').toString('utf-8')`

**Smart emoji selection**:
```javascript
if (name.toLowerCase().includes('winner')) return '🏆';
if (name.toLowerCase().includes('alumni')) return '🎓';
if (name.toLowerCase().includes('jury')) return '⚖️';
if (name.toLowerCase().includes('merge')) return '🤝';
if (type === 'alumni_placements') return '🏆';
return '📋';
```

---

### 1.4 Season Data (applicationConfigs)

**Storage location**: `playerData[guildId].applicationConfigs[configId]`

**Season structure**:
```javascript
{
  seasonId: "unique-season-id",         // Unique identifier (NOT configId)
  seasonName: "Season Name",
  stage: "planning" | "applications" | "cast_review" | "pre_swap" | "merge" | "complete",
  
  // Timestamps
  createdAt: 1234567890,
  lastUpdated: 1234567890,
  
  // Other season config fields (application form, etc.)
  ...
}
```

**Relationship to castlists**:
- Castlist has optional `seasonId` field
- Season is looked up via `playerData[guildId].applicationConfigs[configId]`
  where `config.seasonId === castlist.seasonId`
- Castlist can exist with no season (for cross-season castlists like winners/alumni)

---

## 2. User Interaction Flow

### 2.1 Creating a Castlist

**UI Flow**:
1. User: `/menu` → "Production Menu"
2. User: Select "Castlist Manager" button
3. UI: Shows `createCastlistHub()` with dropdown of existing castlists
4. User: Select "Create New Castlist" option
5. UI: Shows modal from `createEditInfoModalForNew()`
   - Text input: Castlist name
   - String select: Associated season (or "No Season")
   - Text input: Emoji
   - Text input: Description
6. User: Submits modal
7. Handler: Calls `CastlistManager.createCastlist(guildId, config)`
8. Storage: Creates entity in `castlistConfigs[id]`

**Code path**:
```
castlistHub.js:createCastlistHub()
  ↓ (User selects "Create New Castlist")
castlistHandlers.js:createEditInfoModalForNew()
  ↓ (User submits modal)
app.js:castlist_create_new_modal handler
  ↓
castlistManager.js:createCastlist()
  ↓ Stores to playerData[guildId].castlistConfigs[id]
```

### 2.2 Selecting a Castlist

**UI Flow**:
1. User: Opens Castlist Manager hub
2. UI: Shows dropdown with all castlists (real + virtual)
   - "Active Castlist" (default) always first
   - "Create New Castlist" always second
   - Real castlists sorted alphabetically
   - Virtual castlists marked "[Legacy]"
3. User: Selects a castlist
4. Handler: `handleCastlistSelect()` in castlistHandlers.js
5. Response: Shows castlist details + management buttons

**Castlist matching logic** (from app.js show_castlist2):
```javascript
const matchesCastlist = (
  tribe.castlist === castlistName ||              // Legacy format
  tribe.castlistId === requestedCastlistId ||    // Transitional format
  (tribe.castlistIds && Array.isArray(tribe.castlistIds) &&
   tribe.castlistIds.includes(requestedCastlistId)) || // Current format
  (\!tribe.castlist && \!tribe.castlistId && \!tribe.castlistIds &&
   (castlistName === 'default' || requestedCastlistId === 'default')) ||
  (tribe.castlist === 'default' &&
   (castlistName === 'Active Castlist' || requestedCastlistId === 'default')) ||
  (tribe.castlistIds?.includes('default') &&
   (castlistName === 'Active Castlist' || requestedCastlistId === 'default'))
);
```

### 2.3 Displaying a Castlist

**Display flow** (castlistV2.js):
1. Get all tribes matching the castlist
2. Calculate component budget based on tribe sizes
3. Determine display scenario: "ideal" or "multi-page"
   - "ideal": All tribes have ≤8 players
   - "multi-page": Any tribe has >8 players (paginated)
4. Create Components V2 structure for each tribe
5. Include navigation buttons and install buttons

**Component budget** (Discord limit: 50 per message, minus overhead):
- Each player: 3 components (Section + TextDisplay + Thumbnail accessory)
- Tribe overhead: 3 (Container + Header Section + Separator)
- Installation: 3 (Separator + ActionRow + Button)
- Navigation: 4 (ActionRow + 3 buttons)

---

## 3. Virtual Adapter Mechanics

### 3.1 How Virtual Castlists Work

**Virtual adapter purpose**: Make legacy castlists (stored as tribe strings) appear as real entities without migration.

**Scan process** (getAllCastlists):
1. Load real castlist entities from `castlistConfigs`
2. Scan all tribes for `tribe.castlist` strings
3. For each unique castlist name:
   - Generate consistent virtual ID (base64 encoded)
   - Create virtual entity with scanned tribe IDs
4. Return merged Map of real + virtual castlists

**Key logic**:
```javascript
if (castlist.type === 'alumni_placements') {
  castlist.settings.sortStrategy = 'placements';
  castlist.settings.showRankings = true;
}
```

### 3.2 Materialization

When a user edits a virtual castlist, it's "materialized" into a real entity:

```javascript
async materializeCastlist(guildId, virtualId) {
  const virtual = await this.getCastlist(guildId, virtualId);
  
  // Create real entity from virtual
  const realId = `castlist_${Date.now()}_system`;
  const realCastlist = {
    ...virtual,
    id: realId,
    type: 'system',
    isVirtual: false,
    createdAt: Date.now(),
    createdBy: 'migration'
  };
  
  // Update tribes to use real ID
  for (const tribeId of virtual.tribes) {
    if (\!tribes[tribeId].castlistIds) {
      tribes[tribeId].castlistIds = [];
    }
    tribes[tribeId].castlistIds.push(realId);
  }
  
  // Save real entity and updated tribes
}
```

### 3.3 Migration Statistics

```javascript
async getMigrationStats(guildId) {
  // Returns:
  {
    total: number,      // All castlists (real + virtual)
    real: number,       // Real entities
    virtual: number,    // Legacy virtual castlists
    migrated: number    // Real castlists with migratedFrom metadata
  }
}
```

---

## 4. Season Integration

### 4.1 Castlist-Season Relationship

**One-to-many relationship**:
- Castlist `seasonId` → points to one season
- Season can have multiple castlists (via reverse lookup)

**Lookup pattern**:
```javascript
// From castlistId to season
const season = Object.values(playerData[guildId].applicationConfigs || {})
  .find(config => config.seasonId === castlist.seasonId);

// From seasonId to castlists
const castlists = Object.values(castlistConfigs)
  .filter(c => c.seasonId === seasonId);
```

### 4.2 Season Integration with Castlist Display

**Tribe gets castlistSettings** (from app.js show_castlist2 handler):
```javascript
allTribes.push({
  ...tribe,
  castlistSettings: {
    ...castlistEntity?.settings,
    seasonId: castlistEntity?.seasonId  // PHASE 2: For placement lookups
  }
});
```

**Used in castlistV2.js for sorting**:
```javascript
const seasonId = tribe.castlistSettings?.seasonId;
// ... then use seasonId for placement lookups
```

**Used in castlistSorter.js**:
```javascript
const seasonId = tribeData.castlistSettings?.seasonId || 'global';
```

---

## 5. Real vs Virtual: Examples from Backup Data

### Example 1: Rumrunners Guild (Legacy System)
```javascript
"1297188286191767603": {
  "tribes": {
    "1297206459301367914": {
      "emoji": null,
      "castlist": "production"
    },
    "1297199733718384744": {
      "emoji": null,
      "castlist": "carl"
    }
  },
  // NO castlistConfigs entry exists
  // Virtual adapter creates these on the fly
}
```

Adapter would create:
- `virtual_cHJvZHVjdGlvbg` → name: "production"
- `virtual_Y2FybA` → name: "carl"

### Example 2: Real Castlist Entity (After Creation)
```javascript
"1301916019050713089": {
  "castlistConfigs": {
    "castlist_1704067890123_system": {
      "id": "castlist_1704067890123_system",
      "name": "Alumni Placements",
      "type": "alumni_placements",
      "seasonId": "season-uuid",
      "createdAt": 1704067890123,
      "createdBy": "system",
      "settings": {
        "sortStrategy": "placements",
        "showRankings": true,
        "maxDisplay": 25,
        "visibility": "public"
      },
      "metadata": {
        "description": "Alumni placement rankings",
        "emoji": "🏆"
      },
      "rankings": {
        "userId1": { "rank": 1, "points": 100 }
      }
    },
    "default": {
      "id": "default",
      "name": "Active Castlist",
      "type": "system",
      "createdAt": 1704067890123,
      "createdBy": "system",
      "settings": {
        "sortStrategy": "alphabetical",
        "showRankings": false,
        "maxDisplay": 25,
        "visibility": "public"
      },
      "metadata": {
        "description": "Active season castlist",
        "emoji": "📋",
        "isDefault": true
      }
    }
  },
  "tribes": {
    "1127614270306263080": {
      "emoji": "🤓",
      "castlistIds": ["default", "castlist_1704067890123_system"]
    }
  }
}
```

---

## 6. Key Functions by Module

### castlistManager.js (Entity Management)
```javascript
async createCastlist(guildId, config)          // Create new entity
async getCastlist(guildId, castlistId)         // Get real or virtual
async getAllCastlists(guildId)                 // Get all castlists
async updateCastlist(guildId, castlistId, updates)
async deleteCastlist(guildId, castlistId)
```

### castlistVirtualAdapter.js (Virtualization)
```javascript
async getAllCastlists(guildId)                 // Real + virtual
async getCastlist(guildId, castlistId)
generateVirtualId(castlistName)
decodeVirtualId(virtualId)
isVirtualId(castlistId)
async materializeCastlist(guildId, virtualId)
async getTribesUsingCastlist(guildId, castlistId)
getCastlistEmoji(name, type)
async getMigrationStats(guildId)
```

### castlistHandlers.js (User Interactions)
```javascript
async createEditInfoModalForNew(guildId)       // Modal for new castlist
async handleCastlistSelect(req, res, client)   // Selection handler
async handleCastlistButton(req, res, client, custom_id)
async handleCastlistDelete(req, res, client, custom_id)
async handleCastlistDeleteConfirm(req, res, client, custom_id)
```

### castlistHub.js (UI Builder)
```javascript
async createCastlistHub(guildId, options)      // Main hub UI
async createCastlistDetailsSection(guildId, castlist)
async createHotSwappableInterface(guildId, castlist, activeButton)
function createManagementButtons(castlistId, enabled, activeButton, isVirtual, castlistName)
async createCastlistWizard(guildId, createType)
```

### castlistV2.js (Display)
```javascript
export async function buildCastlist2ResponseData(guild, tribes, castlistId, ...)
function calculateComponentsForTribe(playerCount)
function determineDisplayScenario(tribes)
function calculateTribePages(tribe, members, guild)
export function createNavigationState(tribes, scenario, ...)
function reorderTribes(tribes, userId, strategy, castlistName)
```

---

## 7. Comparison: What's Documented vs. What's Actually Implemented

| Feature | Documented | Actually Implemented | Status |
|---------|-----------|---------------------|--------|
| CastlistV3 entities | ✅ Yes, heavily | ✅ Yes | Ready |
| Virtual adapter | ✅ Yes | ✅ Yes | Production |
| Multi-castlist support | ✅ Documented | ✅ Partial (castlistIds array exists) | In Progress |
| Season integration | ✅ Yes | ✅ Yes (seasonId on castlist) | Ready |
| Alumni placements type | ✅ Yes | ✅ Yes | Ready |
| Castlist creation UI | ✅ Yes | ✅ Yes | Ready |
| Castlist editor | ✅ Yes | ✅ Yes (hot-swap interface) | Ready |
| Migration stats | ✅ Yes | ✅ Yes | Ready |
| Legacy castlist cleanup | ❓ Partial | ✅ Yes (delete cleans tribes) | Ready |

---

## 8. Current Limitations & Quirks

1. **Default castlist ambiguity**: Can have two names:
   - Stored as: `castlist: "default"` (legacy) or `castlistId: "default"` (new)
   - Displayed as: "Active Castlist" (real entity) or matched by name "default"

2. **Type field split**: Exists in two places with different values:
   - On tribe: `tribe.type = "alumni_placements"` (legacy)
   - On castlist: `castlist.type = "custom" | "system" | ...` (new)
   - Deletion removes tribe.type but castlist.type persists

3. **Rankings split**: Also exists in two places:
   - On tribe: `tribe.rankings = {...}` (legacy)
   - On castlist: `castlist.rankings = {...}` (new)

4. **Virtual IDs are stable**: Same castlist name always generates same virtual ID
   - Allows consistent references across requests
   - But doesn't handle castlist name changes (would break old references)

5. **Components V2 flag required**: All castlist display uses flag `1 << 15`
   - IS_COMPONENTS_V2 flag in response

6. **Default castlist always exists**:
   - Created virtually if no real entity exists
   - Automatically materialized on first edit
   - Special ID: "default" (not generated with timestamp)

---

## 9. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│ User Interaction (app.js routes)                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  /menu → castlist_select → castlistHandlers.js          │
│           ↓                                              │
│      handleCastlistSelect()                             │
│           ↓                                              │
│  createCastlistHub() ─────────→ castlistVirtualAdapter  │
│           ↓                            ↓                 │
│  Show dropdown with:                 ┌─────────────────┐│
│  - Real entities (castlistConfigs)   │ Scan tribes for ││
│  - Virtual entities (computed)       │ castlist strings││
│  - Default (always first)            │ Generate virtual││
│                                      │ IDs on-the-fly  ││
│           ↓                          └─────────────────┘│
│      User selects castlist                              │
│           ↓                                              │
│  show_castlist2 handler                                 │
│           ↓                                              │
│  buildCastlist2ResponseData()                           │
│      (castlistV2.js)                                    │
│           ↓                                              │
│  Display tribes + players                              │
│  (Components V2 format)                                 │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Storage Layer (playerData.json)                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ playerData[guildId]                                     │
│   ├─ castlistConfigs[id]                               │
│   │   ├─ "default" → Real default entity               │
│   │   ├─ "castlist_123_user" → Custom castlist         │
│   │   └─ "castlist_456_user" → Alumni castlist         │
│   │                                                     │
│   ├─ tribes[roleId]                                    │
│   │   ├─ emoji: "🤓"                                   │
│   │   ├─ castlist: "production" (LEGACY)               │
│   │   ├─ castlistId: "castlist_123" (TRANSITIONAL)     │
│   │   └─ castlistIds: [...] (CURRENT)                  │
│   │                                                     │
│   └─ applicationConfigs[configId]                      │
│       ├─ seasonId: "uuid"                              │
│       ├─ seasonName: "Season 1"                        │
│       └─ stage: "active"                               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 10. Key Takeaways

1. **Dual system in production**: Legacy string-based and new entity-based coexist
2. **Virtual adapter is the bridge**: Makes old data look new without migration
3. **No forced migration**: Users can operate indefinitely with legacy castlists
4. **Default castlist is special**: Always exists, always available, always ID "default"
5. **Multi-castlist support in progress**: Array format exists but display uses single castlist
6. **Season integration is functional**: Castlists can link to seasons via seasonId
7. **Type field is duplicated**: Exists on both tribe (legacy) and castlist (new)
8. **Real IDs are timestamped**: Format `castlist_[timestamp]_[creator]` except "default"
9. **Virtual IDs are base64**: Format `virtual_[encoded_name]`, stable for same castlist name
10. **Components V2 is required**: All castlist display uses new Discord component format
