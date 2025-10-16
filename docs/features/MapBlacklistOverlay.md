# Map Blacklist Overlay Feature

## Overview

The Map Blacklist Overlay feature dynamically overlays visual indicators on Safari map images to show:
- **Blacklisted cells** (restricted coordinates) in semi-transparent red
- **Reverse Blacklist unlocks** (items that grant access) in semi-transparent green

This feature provides visual feedback to admins when viewing maps in the Map Explorer, helping them understand which areas are restricted and which items can unlock them.

## Problem Statement

Currently, when admins view maps in the Map Explorer (`safari_map_explorer` button), the map image shows no visual indication of:
1. Which cells are blacklisted (restricted access)
2. Which items grant reverse blacklist access to specific coordinates

This makes it difficult to visualize the map's access control configuration at a glance.

## Solution Design

### Live-Update Pattern (Recommended)

Generate the overlay **dynamically on every Map Explorer call** using the deferred response pattern.

**Why This Approach:**
- ✅ Always accurate (reflects current blacklist configuration)
- ✅ No data structure changes required
- ✅ Simple to maintain (single code path)
- ✅ Fast enough with deferred responses (~1-2 seconds)
- ✅ Preserves original map image for future use

**Why NOT Update on Configuration Changes:**
- ❌ Complex to track all modification points
- ❌ Requires extensive change detection logic
- ❌ Messy to maintain (as noted by user)

## Data Structure

### Current Structure (safariContent.json)

```javascript
{
  "guildId": {
    "maps": {
      "map_7x7_1753981993871": {
        "id": "map_7x7_1753981993871",
        "name": "Adventure Map",
        "gridSize": 7,
        "discordImageUrl": "https://cdn.discordapp.com/attachments/.../map_7x7_1753981993871.png",
        // ... other map properties
      },
      "active": "map_7x7_1753981993871"
    },
    "items": {
      "large_boat": {
        "reverseBlacklist": ["A1", "B1", "C1"]  // Unlocks these coordinates
      }
    }
  }
}
```

### Proposed Structure Enhancement

**IMPORTANT**: Maintain the original image URL separately to preserve the "clean" map for future features.

```javascript
{
  "guildId": {
    "maps": {
      "map_7x7_1753981993871": {
        "id": "map_7x7_1753981993871",
        "name": "Adventure Map",
        "gridSize": 7,
        "discordImageUrl": "https://cdn.discordapp.com/.../map_original.png",  // ORIGINAL (clean) map
        "blacklistOverlayUrl": null,  // Generated dynamically, not stored
        // ... other map properties
      }
    }
  }
}
```

**Key Points:**
- `discordImageUrl` always points to the **original, clean map image**
- `blacklistOverlayUrl` would be generated on-the-fly (not persisted)
- This preserves the ability to use clean maps for other features in the future

## Technical Implementation

### File Locations

**Primary Files to Modify:**
- `app.js` - `safari_map_explorer` button handler (line ~22850)
- `mapExplorer.js` - New function `generateBlacklistOverlay()`
- `playerLocationManager.js` - Reuse `getReverseBlacklistItemSummary()` (already exists)

**Existing Functions to Reuse:**
- `getBlacklistedCoordinates(guildId)` from `mapExplorer.js` (line ~1430)
- `getReverseBlacklistItemSummary(guildId)` from `playerLocationManager.js` (line ~396)
- `uploadImageToDiscord(guild, filePath, fileName)` from `mapExplorer.js` (line ~186)

### Implementation Steps

#### Step 1: Modify `safari_map_explorer` Button Handler

**File**: `app.js` (line ~22850)

**Current Pattern** (synchronous):
```javascript
} else if (custom_id === 'safari_map_explorer') {
  return ButtonHandlerFactory.create({
    id: 'safari_map_explorer',
    ephemeral: true,
    handler: async (context) => {
      // ... load map data ...
      // ... build response with discordImageUrl ...
      return { components: [...] };
    }
  })(req, res, client);
}
```

**New Pattern** (deferred with overlay):
```javascript
} else if (custom_id === 'safari_map_explorer') {
  return ButtonHandlerFactory.create({
    id: 'safari_map_explorer',
    ephemeral: true,
    deferred: true,  // NEW: Enable deferred response
    handler: async (context) => {
      // Load map data
      const safariData = await loadSafariContent();
      const activeMapId = safariData[context.guildId]?.maps?.active;
      const activeMap = safariData[context.guildId]?.maps?.[activeMapId];

      // Generate overlay (expensive operation)
      const { generateBlacklistOverlay } = await import('./mapExplorer.js');
      const overlayImageUrl = await generateBlacklistOverlay(
        context.guildId,
        activeMap.discordImageUrl,  // Original clean map
        activeMap.gridSize,
        context.client
      );

      // Build response with overlaid image
      return {
        components: [{
          type: 17,  // Container
          components: [
            { type: 10, content: '# 🗺️ Map Explorer...' },
            { type: 14 },  // Separator
            {
              type: 12,  // Media Gallery
              items: [{
                url: overlayImageUrl,  // Use overlaid image
                description: 'Map with blacklist indicators'
              }]
            },
            // ... buttons ...
          ]
        }]
      };
    }
  })(req, res, client);
}
```

#### Step 2: Create `generateBlacklistOverlay()` Function

**File**: `mapExplorer.js` (new function, add around line ~1500)

```javascript
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate a map image with blacklist overlays
 *
 * @param {string} guildId - Guild ID
 * @param {string} originalImageUrl - Discord CDN URL of original clean map
 * @param {number} gridSize - Map grid size (e.g., 7 for 7x7)
 * @param {Object} client - Discord.js client instance
 * @returns {Promise<string>} Discord CDN URL of overlaid image
 */
export async function generateBlacklistOverlay(guildId, originalImageUrl, gridSize, client) {
  try {
    console.log(`🎨 Generating blacklist overlay for guild ${guildId}`);

    // Step 1: Download original map image from Discord CDN
    const imageResponse = await fetch(originalImageUrl);
    const imageBuffer = await Buffer.from(await imageResponse.arrayBuffer());

    // Step 2: Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const cellWidth = metadata.width / gridSize;
    const cellHeight = metadata.height / gridSize;

    console.log(`📐 Map dimensions: ${metadata.width}x${metadata.height}, Cell size: ${cellWidth}x${cellHeight}`);

    // Step 3: Get blacklisted coordinates
    const blacklistedCoords = await getBlacklistedCoordinates(guildId);
    console.log(`🚫 Found ${blacklistedCoords.length} blacklisted cells: ${blacklistedCoords.join(', ')}`);

    // Step 4: Get reverse blacklist items
    const { getReverseBlacklistItemSummary } = await import('./playerLocationManager.js');
    const reverseBlacklistItems = await getReverseBlacklistItemSummary(guildId);
    const reverseBlacklistCoords = new Set(
      reverseBlacklistItems.flatMap(item => item.coordinates)
    );
    console.log(`🔓 Found ${reverseBlacklistCoords.size} reverse blacklist unlock coordinates`);

    // Step 5: Create overlay rectangles
    const overlays = [];

    // Helper function to convert coordinate to pixel position
    const coordToPosition = (coord) => {
      const col = coord.charCodeAt(0) - 65;  // A=0, B=1, etc.
      const row = parseInt(coord.substring(1)) - 1;  // 1-based to 0-based
      return {
        left: Math.floor(col * cellWidth),
        top: Math.floor(row * cellHeight)
      };
    };

    // Red overlay for blacklisted cells
    for (const coord of blacklistedCoords) {
      const pos = coordToPosition(coord);

      // Create red semi-transparent rectangle
      const redOverlay = await sharp({
        create: {
          width: Math.floor(cellWidth),
          height: Math.floor(cellHeight),
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 0.3 }  // 30% red
        }
      }).png().toBuffer();

      overlays.push({
        input: redOverlay,
        top: pos.top,
        left: pos.left
      });
    }

    // Green overlay for reverse blacklist unlocks (on top of red)
    for (const coord of reverseBlacklistCoords) {
      if (blacklistedCoords.includes(coord)) {
        const pos = coordToPosition(coord);

        // Create green semi-transparent rectangle
        const greenOverlay = await sharp({
          create: {
            width: Math.floor(cellWidth),
            height: Math.floor(cellHeight),
            channels: 4,
            background: { r: 0, g: 255, b: 0, alpha: 0.4 }  // 40% green
          }
        }).png().toBuffer();

        overlays.push({
          input: greenOverlay,
          top: pos.top,
          left: pos.left
        });
      }
    }

    console.log(`🎨 Created ${overlays.length} overlay rectangles`);

    // Step 6: Composite all overlays onto the original image
    const overlaidImage = await sharp(imageBuffer)
      .composite(overlays)
      .png()
      .toBuffer();

    // Step 7: Save to temporary file
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `map_overlay_${guildId}_${Date.now()}.png`);
    await sharp(overlaidImage).toFile(tempFilePath);

    console.log(`💾 Saved overlaid image to: ${tempFilePath}`);

    // Step 8: Upload to Discord and get CDN URL
    const guild = await client.guilds.fetch(guildId);
    const discordUrl = await uploadImageToDiscord(guild, tempFilePath, `map_overlay_${Date.now()}.png`);

    // Step 9: Clean up temporary file
    fs.unlinkSync(tempFilePath);
    console.log(`🗑️ Cleaned up temporary file: ${tempFilePath}`);

    console.log(`✅ Generated overlay image: ${discordUrl}`);
    return discordUrl;

  } catch (error) {
    console.error('❌ Error generating blacklist overlay:', error);
    // Fallback: Return original image URL if overlay fails
    return originalImageUrl;
  }
}
```

#### Step 3: Add Legend to Map Explorer UI

**Update the Map Explorer response to include a legend explaining the colors:**

```javascript
// In the container components array:
{
  type: 10,  // Text Display
  content: `**Legend:**
🟥 Red overlay = Blacklisted (restricted access)
🟩 Green overlay = Reverse blacklist unlock available
⬜ No overlay = Normal access`
}
```

## Performance Analysis

### Estimated Timing Breakdown

| Operation | Time | Notes |
|-----------|------|-------|
| Download image from Discord CDN | 200-500ms | Depends on image size and network |
| Get blacklisted coordinates | 50-100ms | File I/O + parsing |
| Get reverse blacklist items | 50-100ms | File I/O + parsing |
| Sharp overlay compositing | 100-300ms | Sharp is highly optimized |
| Save to temp file | 50-100ms | Local filesystem write |
| Upload to Discord | 500-1000ms | Network operation |
| **Total** | **~1-2 seconds** | Well within deferred response tolerance |

### Performance Optimizations

1. **Deferred Response Pattern**: Prevents 3-second Discord timeout
2. **Sharp Library**: Native C++ bindings make compositing very fast
3. **Single-Pass Compositing**: All overlays applied in one operation
4. **Temp File Cleanup**: Prevents disk space accumulation

### Fallback Strategy

If overlay generation fails for any reason:
- **Return the original clean map image** (graceful degradation)
- **Log the error** for debugging
- **User still sees the map** (just without overlay indicators)

## Testing Strategy

### Test Cases

1. **Empty Blacklist**: No overlays, returns original image
2. **Blacklist Only**: Red overlays on restricted cells
3. **Reverse Blacklist Only**: No visual change (green only shows where red exists)
4. **Both Blacklist and Reverse**: Red cells with green overlays on unlocked cells
5. **Performance**: Verify <3 second response time
6. **Error Handling**: Simulate fetch failure, verify fallback to original

### Manual Testing Steps

1. Configure blacklisted cells: `/menu` → Safari → Map Admin → Blacklist
2. Create item with reverse blacklist: `/menu` → Safari → Items → [Item] → Movement
3. Click Map Explorer button
4. Verify:
   - Deferred "thinking" message appears
   - Map loads within 2 seconds
   - Red overlays on blacklisted cells
   - Green overlays on cells unlocked by items
   - Legend is present and accurate

## Edge Cases & Validation

1. **Invalid Coordinates**: Skip coordinates that don't exist on the grid
2. **Grid Size Mismatch**: Use metadata dimensions, not assumed grid size
3. **Missing Original Image**: Return error, don't crash
4. **Concurrent Requests**: Each request generates its own overlay (no shared state issues)
5. **Large Grids (20x20+)**: May take slightly longer but should still complete <3s

## Future Enhancements

### Phase 2 Features (Not Implemented Yet)

1. **Item Icons**: Show item emoji on reverse blacklist cells
2. **Coordinate Labels**: Overlay coordinate text (A1, B2, etc.)
3. **Player Positions**: Show player icons on the map
4. **Custom Colors**: Admin-configurable overlay colors
5. **Cached Overlays**: Generate once per N minutes instead of every call
6. **Hover Tooltips**: Show which items unlock each cell (Discord limitation: not possible with Media Gallery)

### Alternative Implementation Patterns

**Pattern B: Pre-Generate on Upload**
```javascript
// During map upload, generate BOTH clean and overlaid versions
mapData.discordImageUrl = cleanImageUrl;
mapData.blacklistOverlayUrl = overlayImageUrl;
```
- Pros: Instant display in Map Explorer
- Cons: Stale data, complex invalidation logic, not recommended

**Pattern C: Background Worker**
```javascript
// Regenerate overlay every 5 minutes in background
setInterval(() => regenerateAllOverlays(), 5 * 60 * 1000);
```
- Pros: Fast display, relatively fresh data
- Cons: Resource usage, unnecessary in low-traffic servers

## Implementation Checklist

### Phase 1: Core Overlay (2-3 hours)

- [ ] Modify `safari_map_explorer` handler to use deferred pattern
- [ ] Create `generateBlacklistOverlay()` function in `mapExplorer.js`
- [ ] Add legend to Map Explorer UI
- [ ] Test with empty blacklist (should show original)
- [ ] Test with blacklist only (should show red)
- [ ] Test with reverse blacklist (should show green on red)

### Phase 2: Polish & Edge Cases (1 hour)

- [ ] Add error handling and fallback to original image
- [ ] Test performance with large grids (15x15, 20x20)
- [ ] Add cleanup for temp files
- [ ] Verify deferred response completes <3 seconds
- [ ] Add logging for debugging

### Phase 3: Documentation (30 min)

- [ ] Update SafariMapSystem.md with overlay feature
- [ ] Add usage instructions for admins
- [ ] Document color meanings in UI

## Security Considerations

1. **Temp File Cleanup**: Always delete temp files after upload
2. **Permission Check**: Map Explorer already requires ManageRoles permission
3. **Input Validation**: Validate coordinate format before processing
4. **Resource Limits**: Sharp operations are memory-safe (no user input to Sharp)

## Related Features

- **Reverse Blacklist**: `docs/features/SafariReverseBlacklist.md`
- **Map System**: `docs/features/SafariMapSystem.md`
- **Map Explorer**: `mapExplorer.js` (line ~1430+)
- **Player Location Manager**: `playerLocationManager.js` (line ~396)

## Questions & Decisions Log

**Q: Should we cache the overlaid image?**
A: No, generate on every call. Simpler and always accurate.

**Q: What if Sharp operations fail?**
A: Fallback to original image URL, log error for debugging.

**Q: Should we modify the stored discordImageUrl?**
A: No, keep original clean map. Generate overlay on-the-fly.

**Q: What overlay opacity should we use?**
A: Red 30%, Green 40% (green is on top of red, needs higher opacity).

**Q: Should we show legend?**
A: Yes, add text display component explaining colors.

---

**Document Version**: 1.0
**Created**: 2025-10-16
**Last Updated**: 2025-10-16
**Status**: Design Complete, Implementation Pending
