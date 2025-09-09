# CastlistV3: Complete System Redesign

## Overview

**Status**: In Development (castlistV3 branch)  
**Created**: January 2025  
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