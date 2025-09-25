# CastlistV3: Complete System Redesign

## Overview

**Status**: In Development (previously CastlistV3 branch, moved to main branch)  
**Created**: September 2025 (Work in progress)  
**Purpose**: Complete redesign of the castlist system to support proper entities, flexible sorting, season integration, and cross-season features

This document outlines the comprehensive redesign of CastBot's castlist system, moving from string-based matching to proper entity management with support for various sorting strategies, season integration, and special castlists that span multiple seasons.

## 🎯 Core Problems Being Solved

### 1. Data Model Issues (Current State)
```javascript
// CURRENT PROBLEM: Castlists are just matching text strings
"tribes": {
  "role1": { "castlist": "Season 47 Alumni" },  // String matching
  "role2": { "castlist": "Season 47 Alumni" },  // Hope they match!
  "role3": { "castlist": "Season 47 Almuni" }   // Typo = broken
}
```

### 2. Feature Limitations
- No central castlist management
- No metadata storage (created date, owner, settings)
- Can't link castlists to seasons
- Can't create cross-season castlists (e.g., "All Winners")
- Manual Discord ID entry for placements
- Limited to top 3 rankings only

### 3. Architectural Issues
- Inverse relationship (tribes reference castlists)
- No proper entity framework
- Scattered configuration across tribes
- No migration path for existing data

## 🏗️ Key Building Blocks

This redesign leverages multiple architectural patterns and systems:

1. **[Season Lifecycle](../concepts/SeasonLifecycle.md)** - Active season concept and management
2. **[Season Integration](CastlistV3-SeasonIntegration.md)** - Bidirectional season/castlist relationships
3. **[Entity Edit Framework](../architecture/EntityEditFramework.md)** - CRUD operations and UI patterns
4. **[Button Handler Factory](../architecture/ButtonHandlerFactory.md)** - Standardized button handling
5. **[Menu System Architecture](../architecture/MenuSystemArchitecture.md)** - Centralized menu management
6. **[LEAN Menu Design](../ui/LeanMenuDesign.md)** - Visual/UX standards

## 📐 New Architecture Design

### Core Entity Structure
```javascript
{
  "guildId": {
    // NEW: Proper castlist entities
    "castlistConfigs": {
      "castlist_1757440123_391415444084490240": {
        "id": "castlist_1757440123_391415444084490240",
        "name": "Season 47 Alumni",
        "type": "alumni_placements",  // or "default", "winners", "custom"
        "seasonId": "config_xyz",      // Optional - not all castlists need seasons
        "createdAt": 1757440123,
        "createdBy": "391415444084490240",
        "settings": {
          "sortStrategy": "placements",  // or "alphabetical", "age", "timezone"
          "showRankings": true,
          "maxDisplay": 25,
          "visibility": "public"
        },
        "metadata": {
          "description": "Final placements for Season 47",
          "emoji": "🏆",
          "accentColor": 0x9b59b6
        }
      }
    },
    
    // Modified tribes structure
    "tribes": {
      "roleId": {
        "castlistId": "castlist_1757440123_391415444084490240",
        "rankings": {},  // Tribe-specific data if needed
        "customSort": []  // Override castlist sorting if needed
      }
    }
  }
}
```

### Castlist Types

#### 1. Season-Specific Castlists
- **Alumni Placements**: Final rankings for a completed season
- **Original Tribes**: Starting tribes for a season
- **Jury Members**: Jury for a specific season
- **Pre-Merge Boots**: Early eliminations from a season

#### 2. Cross-Season Castlists (NEW)
- **Winners Circle**: All winners across all seasons
- **Runner-Ups**: All second-place finishers
- **Fan Favorites**: Popular players from any season
- **Returnees**: Players who've played multiple times

#### 3. Special Castlists
- **Hall of Fame**: Honorary members
- **Production Team**: Show staff
- **Custom Groups**: User-defined collections

## 🔧 Implementation Phases

### Phase 1: Core Infrastructure (Current Focus)
```javascript
// 1. Create castlist entity system
export class CastlistManager {
  async createCastlist(guildId, config) {
    const id = `castlist_${Date.now()}_${config.createdBy}`;
    // Store in castlistConfigs
  }
  
  async getCastlist(guildId, castlistId) {
    // Retrieve with all metadata
  }
  
  async updateCastlist(guildId, castlistId, updates) {
    // Central update point
  }
}

// 2. Update tribe system to use IDs
export async function linkTribeToCastlist(guildId, roleId, castlistId) {
  // Create the relationship
}
```

### Phase 2: Sorting System Enhancement
Building on existing `castlistSorter.js`:
```javascript
export function sortCastlistMembers(members, castlist, tribe) {
  const strategy = tribe.customSort || castlist.settings.sortStrategy;
  
  switch (strategy) {
    case 'placements':      // Existing: 1st, 2nd, 3rd, etc.
    case 'alphabetical':     // Existing: A-Z
    case 'reverse_alpha':    // New: Z-A
    case 'age':             // New: By age field
    case 'timezone':        // New: By timezone
    case 'join_date':       // New: Server join order
    case 'activity':        // New: By activity score
    case 'custom':          // New: Manual ordering
  }
}
```

### Phase 3: UI/UX Improvements
Using Entity Edit Framework patterns:
- **Castlist Management Menu** - Central hub for all castlists
- **Creation Wizard** - Step-by-step castlist creation
- **Bulk Import** - Import from roles/applications/CSV
- **Visual Editor** - Drag-and-drop ranking interface

### Phase 4: Advanced Features
- **Templates** - Pre-configured castlist types
- **Permissions** - Role-based castlist access
- **Scheduling** - Time-based castlist reveals
- **Analytics** - Castlist view tracking
- **Export/Import** - Data portability

## 🔄 Migration Strategy

### Virtual Entity Adapter Pattern
Instead of forcing immediate migration, we use a **virtualization layer** that makes old string-based castlists appear as entities:

```javascript
class CastlistVirtualAdapter {
  async getAllCastlists(guildId) {
    const castlists = new Map();
    
    // 1. Load REAL castlist entities (new system)
    const realCastlists = playerData[guildId]?.castlistConfigs || {};
    for (const [id, castlist] of Object.entries(realCastlists)) {
      castlists.set(id, { ...castlist, isVirtual: false });
    }
    
    // 2. Scan tribes for string-based castlists (old system)
    const tribes = playerData[guildId]?.tribes || {};
    const virtualCastlists = new Map();
    
    for (const [roleId, tribe] of Object.entries(tribes)) {
      if (tribe.castlist && tribe.castlist !== 'default') {
        // Generate consistent virtual ID
        const virtualId = `virtual_${Buffer.from(tribe.castlist).toString('base64')}`;
        
        if (!virtualCastlists.has(virtualId)) {
          // Create virtual entity that LOOKS real
          virtualCastlists.set(virtualId, {
            id: virtualId,
            name: tribe.castlist,
            type: tribe.type || 'legacy',
            isVirtual: true,  // Flag for special handling
            tribes: [roleId],
            settings: {
              sortStrategy: tribe.type === 'alumni_placements' ? 'placements' : 'alphabetical'
            }
          });
        } else {
          // Add tribe to existing virtual castlist
          virtualCastlists.get(virtualId).tribes.push(roleId);
        }
      }
    }
    
    // 3. Merge (skip virtual if real version exists)
    for (const [id, virtualCastlist] of virtualCastlists) {
      const realExists = [...castlists.values()].some(c => 
        c.name === virtualCastlist.name && !c.isVirtual
      );
      if (!realExists) {
        castlists.set(id, virtualCastlist);
      }
    }
    
    return castlists;
  }
}
```

### Lazy Migration (Materialization)
Virtual castlists become real entities only when edited:

```javascript
async materializeCastlist(guildId, virtualId) {
  const virtual = await this.getCastlist(guildId, virtualId);
  if (!virtual.isVirtual) return virtualId;
  
  // Create real entity from virtual
  const realId = `castlist_${Date.now()}_system`;
  const realCastlist = {
    ...virtual,
    id: realId,
    isVirtual: false,
    createdAt: Date.now(),
    createdBy: 'migration'
  };
  
  // Save real entity
  if (!playerData[guildId].castlistConfigs) {
    playerData[guildId].castlistConfigs = {};
  }
  playerData[guildId].castlistConfigs[realId] = realCastlist;
  
  // Update tribes to point to real ID
  for (const tribeId of virtual.tribes) {
    playerData[guildId].tribes[tribeId].castlistId = realId;
    // Keep old string during transition for safety
  }
  
  return realId;
}
```

### Benefits of Virtual Adapter
1. **Zero Breaking Changes**: Old Tribes menu continues working
2. **Immediate Availability**: New Castlist menu sees all castlists
3. **Gradual Migration**: Only migrates when user interacts
4. **Rollback Safety**: Both fields maintained during transition
5. **User Transparent**: Users don't notice the technical migration

### Migration Phases

#### Phase 1: Read-Only Virtual Layer
- Display old castlists as virtual entities
- No data changes required
- Both old and new UIs work

#### Phase 2: Materialization on Edit
- When user edits virtual castlist → convert to real
- Transparent to user
- Maintains backwards compatibility

#### Phase 3: Gradual Deprecation
- Eventually remove old Tribes menu
- All castlists migrated through natural usage
- Clean data model achieved
```

## 🔄 Current Implementation Status & Production Transition

**Status**: Virtual Adapter is LIVE and working silently in production (September 2025)

### How Virtual Adapter Currently Works in Production

The virtual adapter system is already operational and providing seamless backwards compatibility. Here's exactly how it functions:

#### 1. Virtual Entity Creation
When `castlistVirtualAdapter.getAllCastlists(guildId)` is called:
- Loads real castlists from `castlistConfigs` (new format)
- Scans all tribes for legacy `castlist: "name"` strings
- Creates temporary "virtual" entities that look like real entities but aren't saved
- Generates consistent virtual IDs using base64 encoding: `virtual_${base64(name)}`
- Returns unified Map containing both real and virtual castlists

#### 2. Silent Automatic Migration (Materialization)
When a virtual castlist is edited through `castlistManager.updateCastlist()`:
```javascript
// Line 108-110 in castlistManager.js
if (castlistVirtualAdapter.isVirtualId(castlistId)) {
  console.log(`[CASTLIST] Materializing virtual castlist before update`);
  castlistId = await castlistVirtualAdapter.materializeCastlist(guildId, castlistId);
}
```

This automatically:
- Creates permanent entry in `castlistConfigs` with full metadata
- Updates tribes to have BOTH properties for backwards compatibility:
  ```json
  {
    "castlist": "Haszo",  // Legacy (kept for safety)
    "castlistId": "castlist_1757445788734_system"  // New
  }
  ```
- Adds migration tracking metadata:
  ```json
  {
    "migratedFrom": "virtual_SGFzem8",  // base64("Haszo")
    "migrationDate": 1757445788734
  }
  ```

#### 3. Evidence of Successful Migration
The "Haszo" castlist demonstrates successful migration:

**In castlistConfigs:**
```json
"castlist_1757445788734_system": {
  "id": "castlist_1757445788734_system",
  "name": "Haszo2",
  "type": "legacy",
  "createdBy": "migration",
  "metadata": {
    "migratedFrom": "virtual_SGFzem8",
    "migrationDate": 1757445788734
  }
}
```

**In tribes (backwards compatibility maintained):**
```json
"1391142520787832904": {
  "castlist": "Haszo",  // Still present
  "castlistId": "castlist_1757445788734_system"  // Added
}
```

### Current Integration Status

#### ✅ Systems Using Virtual Adapter
- **CastlistV3 Hub** (`castlist_hub_main`) - Uses `castlistManager.getAllCastlists()`
  - Sees all castlists (real and virtual)
  - Triggers automatic migration when virtual castlists are edited
  - **RESTRICTED** to user ID `391415444084490240` only

#### ❌ Systems NOT Using Virtual Adapter
- **`/castlist` command** - Directly accesses `tribe.castlist` string
- **`show_castlist2` handler** - Directly accesses `tribe.castlist` string
- **`determineCastlistToShow()`** - Only looks at `tribe.castlist` string
- **Production Menu castlist buttons** - Use legacy string matching

### 🔒 Production Safety Restrictions

**CRITICAL**: Automatic migration currently only occurs through `castlist_hub_main`, which is:
- Restricted to user ID `391415444084490240` (Reece)
- Hidden from all other production users
- Safe testing environment for new features

**Why This Restriction Matters**:
- Prevents production users from accidentally triggering untested migration scenarios
- Allows thorough testing of new entity system before public exposure
- Maintains production stability while enabling development progress
- Ensures gradual, controlled rollout of new features

### Migration Trigger Points

Currently, virtual castlists are materialized (converted to real entities) when:
1. **Editing castlist metadata** via CastlistV3 Hub
2. **Updating castlist settings** (sort strategy, rankings, etc.)
3. **Any write operation** through `castlistManager.updateCastlist()`

**Important**: Read operations (displaying castlists) do NOT trigger migration - they continue using virtual entities transparently.

### Full Virtual Adapter Integration Recommendations

Based on architectural analysis, here's the complete implementation plan for leveraging virtual adapter across all access methods:

#### Phase 1: Core Function Updates
1. **Update `determineCastlistToShow()` in utils/castlistUtils.js**
   ```javascript
   // CURRENT: Only checks tribe.castlist strings
   const castlists = new Set(
     Object.values(tribes)
       .filter(tribe => tribe?.castlist)
       .map(tribe => tribe.castlist)
   );

   // RECOMMENDED: Use virtual adapter
   const allCastlists = await castlistManager.getAllCastlists(guildId);
   const castlistsByName = new Map();
   for (const castlist of allCastlists.values()) {
     castlistsByName.set(castlist.name, castlist);
   }
   ```

2. **Update `show_castlist2` handler (line 4805)**
   ```javascript
   // CURRENT: Direct tribe access
   const guildTribes = playerData[guildId]?.tribes || {};

   // RECOMMENDED: Use virtual adapter
   const allCastlists = await castlistManager.getAllCastlists(guildId);
   const targetCastlist = [...allCastlists.values()]
     .find(c => c.name === castlistName || c.id === castlistName);
   ```

3. **Update `/castlist` command (line 2031)**
   ```javascript
   // CURRENT: getGuildTribes(guildId, castlistToShow)
   const rawTribes = await getGuildTribes(guildId, castlistToShow);

   // RECOMMENDED: Use virtual adapter consistently
   const castlist = await castlistManager.getCastlist(guildId, castlistId);
   const tribes = await getTribesForCastlist(guildId, castlist);
   ```

#### Phase 2: Display Function Unification
Create single source of truth for castlist display:
```javascript
// Both /castlist and show_castlist2 should use:
const responseData = await buildCastlist2ResponseData(
  guild, tribes, castlistName, navigationState, member, channelId
);
```

**Benefits of Unification**:
- Eliminates duplicate logic between command and button handlers
- Consistent behavior across all access methods
- Single point for virtual adapter integration
- Easier maintenance and testing

#### Phase 3: Gradual Production Integration
Once thoroughly tested in CastlistV3 Hub:
1. **Enable virtual adapter in `/castlist` command first** (lowest risk)
2. **Update `show_castlist2` buttons** (medium risk)
3. **Fully deprecate legacy string matching** (final phase)

**Migration Strategy**:
- Maintain both `castlist` and `castlistId` fields during transition
- Keep backwards compatibility for 1-2 release cycles
- Monitor for any edge cases or user issues
- Gradually remove legacy fields once confidence is high

#### Phase 4: Button Registration & Cleanup
Add castlist navigation buttons to BUTTON_REGISTRY for consistency:
```javascript
// Dynamic patterns to add:
'show_castlist2_*',
'castlist2_nav_*'
```

**Note**: These patterns already work via `startsWith()` checks, but registration improves documentation and debugging.

### Technical Benefits of Full Integration

1. **Unified Data Access**: All systems see same castlists (real + virtual)
2. **Gradual Migration**: Users naturally migrate through normal usage
3. **Zero Breaking Changes**: Legacy code continues working
4. **Rich Metadata**: Access to emoji, colors, descriptions, settings
5. **Extensibility**: Easy to add new castlist types and features
6. **Testing Safety**: Development happens in restricted environment

### Current Limitations & Technical Debt

1. **Multiple Implementations**: 5 different ways to access castlists with varying logic
2. **Inconsistent Virtual Usage**: Only CastlistV3 Hub leverages virtual adapter fully
3. **Legacy String Dependency**: Most systems still depend on `tribe.castlist` strings
4. **Duplicate Display Logic**: `/castlist` and `show_castlist2` have separate implementations
5. **Button Registration Gap**: Navigation buttons work but aren't in BUTTON_REGISTRY

### Recommended Implementation Timeline

**When Ready to Proceed**:
1. **Week 1**: Update `determineCastlistToShow()` and test thoroughly
2. **Week 2**: Update `/castlist` command to use virtual adapter
3. **Week 3**: Update `show_castlist2` handler and test all 5 access methods
4. **Week 4**: Create unified display function and eliminate duplication
5. **Week 5**: Production deployment and monitoring
6. **Week 6**: Remove CastlistV3 Hub restrictions if all stable

## 💡 Key Innovations

### 1. Season-Optional Design
Not all castlists need seasons:
```javascript
// Season-specific castlist
{
  "name": "Season 47 Alumni",
  "seasonId": "config_xyz",  // Links to specific season
  "type": "alumni_placements"
}

// Cross-season castlist
{
  "name": "Winners Circle",
  "seasonId": null,  // No specific season
  "type": "winners",
  "metadata": {
    "pullsFrom": "all_seasons"  // Special indicator
  }
}
```

### 2. Flexible Ranking System
Move beyond top 3 limitations:
```javascript
// Support unlimited placements
"rankings": {
  "userId1": { "placement": 1, "title": "Sole Survivor" },
  "userId2": { "placement": 2, "title": "Runner-Up" },
  "userId3": { "placement": 3, "title": "3rd Place" },
  "userId4": { "placement": 4 },
  // ... up to full cast
  "userId20": { "placement": 20, "title": "First Boot" }
}
```

### 3. Smart Import System
```javascript
// Import from season applications
async function importFromSeason(seasonId) {
  const applications = getSeasonApplications(seasonId);
  return applications.filter(app => app.status === 'accepted');
}

// Import from Discord role
async function importFromRole(roleId) {
  const role = guild.roles.cache.get(roleId);
  return role.members.map(m => m.id);
}
```

## 🎨 UI/UX Improvements

### Castlist Management Hub
Following LEAN Menu Design:
```
## 📋 Castlists | Manage All Cast Lists
━━━━━━━━━━━━━━━━━━━━━━
> **`📊 Your Castlists`**
[Season 47] [Winners] [Hall of Fame]
━━━━━━━━━━━━━━━━━━━━━━
> **`➕ Create New`**
[From Season] [From Role] [Custom] [Import]
━━━━━━━━━━━━━━━━━━━━━━
> **`🔧 Tools`**
[Templates] [Export] [Settings]
━━━━━━━━━━━━━━━━━━━━━━
[← Menu]
```

### Creation Flow
Using Menu System Architecture:
1. Select type (season/cross-season/custom)
2. Choose data source (applications/role/manual)
3. Configure sorting and display
4. Set permissions and visibility
5. Review and create

## 📊 Benefits of Redesign

### For Users
- **Central Management**: One place for all castlists
- **No More Typos**: ID-based system prevents breaks
- **Rich Features**: Rankings, sorting, metadata
- **Cross-Season Support**: Winners, runners-up, etc.
- **Better Import**: From seasons, roles, or files

### For Developers
- **Proper Architecture**: Clean entity system
- **Extensible**: Easy to add new features
- **Maintainable**: Central configuration
- **Testable**: Clear data flow
- **Scalable**: Handles unlimited castlists

### For the System
- **Data Integrity**: No more string matching
- **Performance**: Optimized queries
- **Migration Path**: Smooth upgrade
- **Future-Proof**: Ready for new Discord features

## 🧪 Testing Checklist

### Phase 1: Core System
- [ ] Create castlist entity
- [ ] Link tribes to castlist
- [ ] Display castlist with new system
- [ ] Legacy castlist still works
- [ ] Auto-migration completes

### Phase 2: Features
- [ ] Alumni placements sorting
- [ ] Cross-season castlist creation
- [ ] Import from season
- [ ] Import from role
- [ ] Bulk ranking updates

### Phase 3: UI/UX
- [ ] Management hub displays all castlists
- [ ] Creation wizard works
- [ ] Edit interface functional
- [ ] Delete with confirmation
- [ ] Export/import data

## 📝 Code References

### Key Files
- `castlistManager.js` - NEW: Entity management
- `castlistSorter.js` - Existing: Sorting logic (enhanced)
- `castlistV2.js` - Display engine (updated)
- `storage.js` - Data persistence (modified)
- `castlistMenu.js` - UI components (new)

### Migration Commands
```bash
# Check legacy castlists
grep "castlist.*:" playerData.json

# Test migration
node scripts/migrateCastlists.js --dry-run

# Run migration
node scripts/migrateCastlists.js --execute
```

## 🚀 Next Steps

1. **Immediate**: Implement core entity system
2. **Next Sprint**: Add cross-season support
3. **Following**: Build management UI
4. **Future**: Advanced features and analytics

## 📚 Related Documentation

- [Season Lifecycle](../concepts/SeasonLifecycle.md) - Active season management
- [Season Integration](CastlistV3-SeasonIntegration.md) - Season/castlist relationships
- [Entity Edit Framework](../architecture/EntityEditFramework.md) - UI patterns for entity management
- [Button Handler Factory](../architecture/ButtonHandlerFactory.md) - Button system architecture
- [Menu System Architecture](../architecture/MenuSystemArchitecture.md) - Menu management patterns
- [LEAN Menu Design](../ui/LeanMenuDesign.md) - Visual standards

---

**Note**: This is a comprehensive redesign that maintains backwards compatibility while introducing powerful new features. The architecture is designed to grow with CastBot's needs while solving fundamental issues in the current implementation.