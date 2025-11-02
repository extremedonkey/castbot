# CastBot Castlist System - Quick Reference Guide

## TL;DR

The castlist system uses:
- **Storage**: `playerData[guildId].castlistConfigs[id]` for real entities
- **Legacy data**: `tribe.castlist` string names (virtualized transparently)
- **Virtual adapter**: Makes legacy castlists look like entities without migration

## Key Data Structures

### Real Castlist Entity
```javascript
playerData[guildId].castlistConfigs[id] = {
  id: "castlist_timestamp_creator" | "default",
  name: "Display Name",
  type: "custom" | "alumni_placements" | "system" | "winners",
  seasonId: "uuid" | null,
  settings: { sortStrategy, showRankings, maxDisplay, visibility },
  metadata: { emoji, description, ... },
  rankings: { userId: {...} }  // Optional
}
```

### Tribe Castlist Reference (All Three Formats Coexist\!)
```javascript
playerData[guildId].tribes[roleId] = {
  emoji: "🤓",
  castlist: "production",                    // Format 1: LEGACY STRING
  castlistId: "castlist_123_user",          // Format 2: SINGLE ID
  castlistIds: ["castlist_123", "default"]  // Format 3: ARRAY (CURRENT)
}
```

## File Organization

| File | Purpose |
|------|---------|
| `castlistManager.js` | CRUD operations (create, read, update, delete) |
| `castlistVirtualAdapter.js` | Makes legacy castlists look like entities |
| `castlistHandlers.js` | Button/modal handlers (user interactions) |
| `castlistHub.js` | UI builder for castlist management |
| `castlistV2.js` | Display/rendering logic (Components V2) |
| `castlistMenu.js` | Season selector UI |
| `castlistSorter.js` | Sorting strategies |
| `utils/castlistUtils.js` | Utility functions |

## Key Functions

### Get All Castlists (Real + Virtual)
```javascript
import { castlistManager } from './castlistManager.js';
const allCastlists = await castlistManager.getAllCastlists(guildId);
// Returns: Map<id, entity>
```

### Create New Castlist
```javascript
const castlist = await castlistManager.createCastlist(guildId, {
  name: "Alumni Placements",
  type: "alumni_placements",
  seasonId: "uuid" | null,
  emoji: "🏆",
  description: "Alumni placement rankings",
  sortStrategy: "placements",
  showRankings: true
});
```

### Get Single Castlist
```javascript
const castlist = await castlistManager.getCastlist(guildId, castlistId);
// Works for both real and virtual castlists
```

### Check If Virtual
```javascript
if (castlist.isVirtual) {
  console.log('This is a virtual castlist:', castlist.id);
}
```

### Update Castlist
```javascript
await castlistManager.updateCastlist(guildId, castlistId, {
  name: "New Name",
  seasonId: "new-uuid",
  settings: { sortStrategy: "placements" },
  metadata: { emoji: "🏆" }
});
```

### Delete Castlist
```javascript
const result = await castlistManager.deleteCastlist(guildId, castlistId);
// Returns: { success, virtual, cleanedCount }
```

## ID Formats

### Real IDs
```javascript
// Generated on creation
"castlist_1704067890123_system"    // Format: castlist_[timestamp]_[creator]

// Special system ID
"default"                           // Always "default" for default castlist
```

### Virtual IDs
```javascript
"virtual_cHJvZHVjdGlvbg"           // Format: virtual_[base64url(castlistName)]
// Decodes to: "production"

// Generation:
const virtualId = Buffer.from("production")
  .toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
// Result: "virtual_cHJvZHVjdGlvbg"
```

## Virtual Castlist Recognition

```javascript
import { castlistVirtualAdapter } from './castlistVirtualAdapter.js';

// Check if virtual
const isVirtual = castlistVirtualAdapter.isVirtualId(castlistId);

// Decode virtual ID back to name
const castlistName = castlistVirtualAdapter.decodeVirtualId(castlistId);

// Get tribes using castlist
const tribeIds = await castlistVirtualAdapter.getTribesUsingCastlist(guildId, castlistId);
```

## Castlist Types and Defaults

| Type | Default Emoji | Settings | Use Case |
|------|---------------|----------|----------|
| `custom` | 📋 | alphabetical sort, no rankings | User-created castlists |
| `alumni_placements` | 🏆 | placement sort, show rankings | Alumni placement display |
| `winners` | 👑 | alphabetical sort | Cross-season winners |
| `system` | 📋 | varies | System castlists (can't delete) |

## Default Castlist Special Behavior

```javascript
// Always exists (virtual or real)
const defaultCastlist = await castlistManager.getCastlist(guildId, 'default');

// Has special display name
// ID: "default"
// Name: "Active Castlist"
// Type: "system"

// Can be materialized like any virtual
await castlistVirtualAdapter.materializeCastlist(guildId, 'default');
```

## Season Integration

```javascript
// Link castlist to season
await castlistManager.updateCastlist(guildId, castlistId, {
  seasonId: "season-uuid"
});

// Look up season from castlist
const season = Object.values(playerData[guildId].applicationConfigs)
  .find(config => config.seasonId === castlist.seasonId);

// Look up castlists for a season
const castlists = Object.values(playerData[guildId].castlistConfigs)
  .filter(c => c.seasonId === seasonId);
```

## User Interaction Buttons

### Main Button IDs
```javascript
'castlist_select'           // Select castlist from dropdown
'castlist_create_new'       // Open create modal
'castlist_view_*'           // View/edit castlist
'castlist_edit_info_*'      // Edit castlist info
'castlist_add_tribe_*'      // Add tribe to castlist
'castlist_delete_*'         // Delete castlist
'castlist_create_new_modal' // Modal submission (create new)
```

## Components V2 Flag

All castlist display responses use:
```javascript
{
  flags: 1 << 15,  // IS_COMPONENTS_V2 flag
  components: [...]
}
```

## Common Patterns

### Display Castlist to User
```javascript
const { buildCastlist2ResponseData } = await import('./castlistV2.js');
const response = await buildCastlist2ResponseData(
  guild,
  tribes,
  castlistId,
  navigationState,
  member,
  channelId,
  permissionChecker,
  'view'  // or 'edit'
);
return response;
```

### Get Tribes for Castlist
```javascript
const tribes = playerData[guildId].tribes || {};
const castlistTribes = Object.entries(tribes).filter(([roleId, tribe]) => 
  tribe.castlist === castlistName ||                    // Legacy
  tribe.castlistId === castlistId ||                    // Transitional
  tribe.castlistIds?.includes(castlistId)              // Current
);
```

### Match Castlist (All Formats)
```javascript
function matchesCastlist(tribe, castlistName, castlistId) {
  return (
    tribe.castlist === castlistName ||
    tribe.castlistId === castlistId ||
    tribe.castlistIds?.includes(castlistId) ||
    (\!tribe.castlist && \!tribe.castlistId && \!tribe.castlistIds &&
     castlistId === 'default')
  );
}
```

## Migration Status

Current state:
- **Virtual castlists**: 🟡 Production (most guilds)
- **Real castlists**: 🟢 Production ready
- **Hybrid system**: 🟢 Working seamlessly via virtual adapter
- **Multi-castlist (castlistIds array)**: 🟡 Implemented but display uses single castlist

## Debugging

### Get Migration Stats
```javascript
const stats = await castlistVirtualAdapter.getMigrationStats(guildId);
// { total, real, virtual, migrated }
```

### Check What Castlists Exist
```javascript
const all = await castlistManager.getAllCastlists(guildId);
for (const [id, castlist] of all) {
  console.log(`${castlist.name}: ${castlist.isVirtual ? 'virtual' : 'real'}`);
}
```

### Find Tribes in Castlist
```javascript
const tribes = await castlistVirtualAdapter.getTribesUsingCastlist(guildId, castlistId);
console.log(`Tribes: ${tribes.join(', ')}`);
```

## Common Errors & Solutions

| Problem | Solution |
|---------|----------|
| "Virtual ID should have been materialized" | Call materializeCastlist() before editing |
| Castlist not found | Check both castlistConfigs (real) and scan tribes (virtual) |
| Default castlist missing | It auto-creates virtually; materialize if needed |
| Season lookup fails | Season is in applicationConfigs, not castlistConfigs |
| Components not rendering | Add IS_COMPONENTS_V2 flag (1 << 15) |

---

For full details, see `/home/reece/castbot/CASTLIST_DATA_STRUCTURES.md`
