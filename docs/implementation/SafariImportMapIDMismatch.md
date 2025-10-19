# Safari Import Map ID Mismatch - Root Cause & Solution

**Created:** 2025-10-18
**Status:** Design Complete - Ready for Implementation
**Priority:** HIGH - Blocks cross-server Safari migration
**Related:** SafariCustomActionsImportExport.md

---

## Executive Summary

Safari import creates a "ghost map" with correct data instead of updating the active map, causing imported content to be invisible. This happens because import matches by map ID (exact string) instead of by "active map" concept.

**Impact:** Cross-server Safari imports appear to fail - users see default data after import despite data being correctly imported.

**Solution:** Two-part fix:
1. Import updates active map regardless of ID mismatch
2. Store raw import JSON in map-storage channel for audit trail

---

## Root Cause Analysis

### The Problem

**User Workflow:**
```
1. Manually Generate Map in Yellow   → map_7x7_1760774582878 (with channels)
2. Export from Pokevivor             → map_7x7_1758651530323 (with data)
3. Import to Yellow                  → Creates SECOND map (correct data, no channels)
4. Refresh Anchors                   → Updates FIRST map (wrong map!)
```

**Evidence from CastBot Yellow:**
```
Active map: map_7x7_1760774582878
  - 49 coordinates with channels
  - C3: "📍 Location C3" (default template)
  - stores: [] (empty)

Imported map: map_7x7_1758651530323
  - 49 coordinates WITHOUT channels
  - C3: "📍 C3 | Pokemart" (correct data!)
  - stores: ["pokemart_481320"] (correct!)
```

### Why This Happens

**Current import logic (safariImportExport.js:132-178):**
```javascript
for (const [mapId, mapData] of Object.entries(importData.maps)) {
  if (mapId === 'active') {
    // Only update active if NO current active map
    if (!currentData[guildId].maps.active) {  // ← Prevents updating
      currentData[guildId].maps.active = mapData;
    }
    continue;
  }

  // Match by exact map ID
  if (currentData[guildId].maps[mapId]) {  // ← This won't match!
    // Update existing map
  } else {
    // Create NEW map with imported ID  ← This happens instead
    currentData[guildId].maps[mapId] = { ...mapData };
  }
}
```

**The issue:**
- **Manually created map:** ID = `map_7x7_1760774582878`
- **Imported map:** ID = `map_7x7_1758651530323`
- **Condition fails:** `currentData[guildId].maps['map_7x7_1758651530323']` is undefined
- **Result:** Creates NEW map instead of updating existing one

### System Assumptions

**Safari only supports ONE active map:**
- `maps.active` points to single map ID
- All channels/anchors reference coordinates in that map
- Multiple maps are unsupported in the UI

**Therefore:** Import should ALWAYS update the active map, ignoring ID mismatches.

---

## Solution 1: Update Active Map on Import

### Design

**New import logic:**
```javascript
for (const [mapId, mapData] of Object.entries(importData.maps)) {
  if (mapId === 'active') continue;  // Skip pointer, handle separately

  // Get the ACTIVE map ID (where channels are)
  const activeMapId = currentData[guildId].maps?.active;

  // Decide target: active map if exists, otherwise imported ID
  const targetMapId = activeMapId || mapId;

  // Initialize if doesn't exist
  if (!currentData[guildId].maps[targetMapId]) {
    currentData[guildId].maps[targetMapId] = {
      id: targetMapId,
      name: mapData.name,
      gridSize: mapData.gridSize,
      coordinates: {},
      metadata: {
        createdAt: Date.now(),
        lastModified: Date.now()
      }
    };
  }

  const existingMap = currentData[guildId].maps[targetMapId];

  // Update map-level fields
  existingMap.name = mapData.name || existingMap.name;
  existingMap.gridSize = mapData.gridSize || existingMap.gridSize;
  if (mapData.blacklistedCoordinates) {
    existingMap.blacklistedCoordinates = mapData.blacklistedCoordinates;
  }

  // Merge coordinates into active map
  for (const [coord, coordData] of Object.entries(mapData.coordinates || {})) {
    if (existingMap.coordinates[coord]) {
      // Update existing coordinate - preserve channelId/anchorMessageId
      existingMap.coordinates[coord] = {
        ...existingMap.coordinates[coord],  // Preserve runtime fields
        baseContent: coordData.baseContent,
        buttons: coordData.buttons,
        cellType: coordData.cellType,
        discovered: coordData.discovered,
        ...(coordData.stores && { stores: coordData.stores }),
        ...(coordData.hiddenCommands && { hiddenCommands: coordData.hiddenCommands }),
        ...(coordData.specialEvents && { specialEvents: coordData.specialEvents }),
        metadata: {
          ...existingMap.coordinates[coord].metadata,
          lastModified: Date.now()
        }
      };
    } else {
      // New coordinate
      existingMap.coordinates[coord] = {
        ...coordData,
        metadata: {
          createdAt: Date.now(),
          lastModified: Date.now()
        }
      };
    }
  }

  // Set as active if not already
  if (!currentData[guildId].maps.active) {
    currentData[guildId].maps.active = targetMapId;
  }

  // Track for summary
  if (activeMapId && activeMapId !== mapId) {
    // ID mismatch - merged into active map
    summary.warnings = summary.warnings || [];
    summary.warnings.push({
      type: 'map_id_mismatch',
      message: `Imported map "${mapId}" merged into active map "${activeMapId}"`,
      imported: mapId,
      target: activeMapId
    });
    summary.maps.updated++;
  } else if (activeMapId === mapId) {
    // Exact match - normal update
    summary.maps.updated++;
  } else {
    // No existing map - created new
    summary.maps.created++;
  }
}
```

### Benefits

✅ Works with user's workflow (create map → import data)
✅ Preserves channels/anchors (channelId/anchorMessageId)
✅ Updates baseContent/stores/etc from import
✅ No "ghost maps" - single source of truth
✅ Warns user if map IDs don't match

### Import Summary Update

```javascript
export function formatImportSummary(summary) {
  const parts = [];

  // ... existing formatting ...

  // NEW: Warnings section
  if (summary.warnings && summary.warnings.length > 0) {
    parts.push('\n⚠️ **Warnings:**');
    summary.warnings.forEach(warning => {
      if (warning.type === 'map_id_mismatch') {
        parts.push(`   • Map ID mismatch: Import merged into active map`);
        parts.push(`     (Imported: ${warning.imported}, Active: ${warning.target})`);
      }
    });
  }

  return `✅ **Import completed successfully!**\n\n${parts.join('\n')}`;
}
```

---

## Solution 2: Store Raw Imports in Map-Storage Channel

### Purpose

**Audit Trail:**
- See what was actually uploaded
- Rollback capability if import goes wrong
- Debug "why didn't X import?"
- Version history of imports

### Design

**When:** Upload raw JSON immediately when import starts, BEFORE processing

**Where:** Discord channel `#map-storage` (or configurable channel)

**Format:**
```
[Upload File: safari-import-1389538775352348737-1760774582878.json]

Embed:
  Title: 📥 Safari Import Uploaded
  Color: 0x3498db (blue)
  Fields:
    - Imported By: Reece (@extremedonkey)
    - Import Time: 2025-10-18 08:15:32 UTC
    - Source Server: Pokevivor (1420100181017231563)
    - File Size: 52.8 KB
    - Sections: Stores (5), Items (12), Maps (1), Custom Actions (8)
  Footer: Processing import... Results will appear in Safari Admin
```

### Implementation

**Add to `importSafariData()` function:**

```javascript
export async function importSafariData(guildId, importJson, context = {}) {
  try {
    const importData = JSON.parse(importJson);
    validateImportData(importData);

    // NEW: Store raw import in map-storage channel
    await storeRawImport(guildId, importJson, context);

    // ... existing import logic ...
  }
}

/**
 * Store raw import JSON in map-storage channel for audit trail
 * @param {string} guildId - Guild ID
 * @param {string} importJson - Raw JSON string
 * @param {Object} context - Import context (userId, client)
 */
async function storeRawImport(guildId, importJson, context) {
  try {
    const { client, userId } = context;
    if (!client) return;  // No client available (testing)

    // Find map-storage channel
    const guild = await client.guilds.fetch(guildId);
    const mapStorageChannel = guild.channels.cache.find(
      ch => ch.name === 'map-storage' || ch.name === 'safari-storage'
    );

    if (!mapStorageChannel) {
      console.log('ℹ️ No map-storage channel found - skipping raw import storage');
      return;
    }

    // Create file attachment
    const timestamp = Date.now();
    const filename = `safari-import-${guildId}-${timestamp}.json`;
    const buffer = Buffer.from(importJson, 'utf-8');

    // Parse import to get summary
    const importData = JSON.parse(importJson);
    const sections = [];
    if (importData.stores) sections.push(`Stores (${Object.keys(importData.stores).length})`);
    if (importData.items) sections.push(`Items (${Object.keys(importData.items).length})`);
    if (importData.maps) {
      const mapCount = Object.keys(importData.maps).filter(k => k !== 'active').length;
      sections.push(`Maps (${mapCount})`);
    }
    if (importData.customActions) sections.push(`Custom Actions (${Object.keys(importData.customActions).length})`);

    // Get user info
    let userMention = 'Unknown User';
    if (userId) {
      try {
        const user = await client.users.fetch(userId);
        userMention = `${user.username} (<@${userId}>)`;
      } catch (err) {
        userMention = `User ID: ${userId}`;
      }
    }

    // Create embed
    const embed = {
      title: '📥 Safari Import Uploaded',
      color: 0x3498db,  // Blue
      fields: [
        { name: 'Imported By', value: userMention, inline: true },
        { name: 'Import Time', value: `<t:${Math.floor(timestamp / 1000)}:F>`, inline: true },
        { name: 'File Size', value: `${(buffer.length / 1024).toFixed(1)} KB`, inline: true },
        { name: 'Sections', value: sections.join(', ') || 'Empty import', inline: false }
      ],
      footer: { text: 'Processing import... Results will appear in Safari Admin' },
      timestamp: new Date().toISOString()
    };

    // Upload to channel
    await mapStorageChannel.send({
      embeds: [embed],
      files: [{
        attachment: buffer,
        name: filename
      }]
    });

    console.log(`✅ Stored raw import in #map-storage: ${filename}`);

  } catch (error) {
    console.error('⚠️ Failed to store raw import:', error.message);
    // Don't throw - this is non-critical
  }
}
```

### Usage

**After successful import:**
Users can:
1. Download raw JSON from #map-storage to see what was imported
2. Re-import if something went wrong
3. Compare multiple imports to see what changed
4. Debug why certain fields didn't import

**Channel setup:**
- Create `#map-storage` channel (once)
- Bot needs `SEND_MESSAGES` and `ATTACH_FILES` permissions
- Set channel topic: "Audit trail for Safari imports - raw JSON files stored here"

---

## Implementation Plan

### Phase 1: Fix Map ID Mismatch (CRITICAL)

**Priority:** HIGH - Blocks all cross-server imports

**Changes:**
1. Update `importSafariData()` map handling logic
2. Add `summary.warnings` array
3. Update `formatImportSummary()` to show warnings
4. Test with Pokevivor → Yellow import

**Estimated time:** 1-2 hours

**Files modified:**
- `safariImportExport.js` (~40 lines changed)

---

### Phase 2: Add Raw Import Storage (NICE-TO-HAVE)

**Priority:** MEDIUM - Quality of life improvement

**Changes:**
1. Add `storeRawImport()` function
2. Call from `importSafariData()` entry point
3. Create #map-storage channel in dev/prod
4. Test upload with sample import

**Estimated time:** 1 hour

**Files modified:**
- `safariImportExport.js` (~80 lines added)

---

## Testing Plan

### Test 1: Map ID Mismatch (Primary Issue)

**Steps:**
1. CastBot Yellow: Manually create 7x7 map (generates new ID)
2. Pokevivor: Export Safari data
3. CastBot Yellow: Import Pokevivor export
4. Verify import summary shows "Map ID mismatch" warning
5. Check safariContent.json - should have ONE map (not two)
6. Refresh anchors with "All"
7. Navigate to C3 channel
8. **Expected:** Anchor shows "📍 C3 | Pokemart" with Pokemart store button

### Test 2: Normal Import (No Mismatch)

**Steps:**
1. Fresh server (no existing map)
2. Import Safari data
3. Verify no warning about map ID
4. Verify map created with imported ID
5. Verify active map set correctly

### Test 3: Raw Import Storage

**Steps:**
1. Create #map-storage channel
2. Import Safari data
3. Verify file uploaded to channel
4. Verify embed shows correct metadata
5. Download file and verify it matches imported JSON

---

## Success Criteria

✅ Import updates active map instead of creating ghost map
✅ C3 shows Pokemart after Pokevivor import
✅ Only ONE map exists in safariContent.json
✅ Import summary shows warning if map IDs mismatch
✅ Raw imports stored in #map-storage channel
✅ All existing import tests still pass

---

## Rollout

**Development:**
1. Implement Phase 1 fix
2. Test with Pokevivor → Yellow import
3. Verify C3 shows Pokemart
4. Delete ghost map from safariContent.json

**Production:**
1. Deploy Phase 1 to production after testing
2. Phase 2 can follow separately (non-critical)

---

## Related Documentation

- [SafariCustomActionsImportExport.md](./SafariCustomActionsImportExport.md) - Overall import/export design
- [SafariCustomActionsImportExport_GapsAnalysis.md](./SafariCustomActionsImportExport_GapsAnalysis.md) - Manual workflow analysis

---

**Design complete. Ready for implementation.**
