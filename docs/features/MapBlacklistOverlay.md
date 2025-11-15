# Map Blacklist Overlay Feature

## Overview

The Map Blacklist Overlay feature dynamically overlays visual indicators on Safari map images to show:
- **Blacklisted cells** (restricted coordinates) in semi-transparent red
- **Reverse Blacklist unlocks** (items that grant access) with **per-item color coding**
  - Up to 4 items get unique colors (green, orange, yellow, purple)
  - 5+ items use a generic brown color for overflow items
  - Colors ordered by `lastModified` timestamp (most recent first), then alphabetically

This feature provides visual feedback to admins when viewing maps in the Map Explorer, helping them understand which areas are restricted and **which specific item** unlocks each cell.

## Implementation Status

**✅ Phase 1: IMPLEMENTED (Production)**
- Core overlay system with red blacklist indicators
- Single green color for all reverse blacklist unlocks
- Dynamic overlay generation on Map Explorer button click
- Deferred response pattern (~1-2 second generation time)
- Graceful fallback to original image on errors

**📝 Phase 2: DOCUMENTED (This Document)**
- Multi-color enhancement with per-item color coding
- Priority-based sorting (lastModified → alphabetical)
- Overlap resolution for cells unlocked by multiple items
- Dynamic legend generation showing up to 4 unique colors
- Overflow handling with brown color for 5+ items

**🔜 Next Steps**: Implement Phase 2 multi-color enhancement (estimated 4-6 hours)

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

## Multi-Color Enhancement Design

### Color Palette Specification

**Primary Color**: Blacklisted cells (always red)
- 🟥 Red: `{ r: 255, g: 0, b: 0, alpha: 0.3 }` - Blacklisted (impossible to pass)

**Reverse Blacklist Item Colors** (assigned in priority order):

| Priority | Color | RGB Values | Emoji | Usage |
|----------|-------|------------|-------|-------|
| 1st item | 🟩 Green | `{ r: 0, g: 255, b: 0, alpha: 0.4 }` | 🟩 | Most recently modified item |
| 2nd item | 🟧 Orange | `{ r: 255, g: 165, b: 0, alpha: 0.4 }` | 🟧 | Second most recent |
| 3rd item | 🟨 Yellow | `{ r: 255, g: 255, b: 0, alpha: 0.4 }` | 🟨 | Third most recent |
| 4th item | 🟪 Purple | `{ r: 128, g: 0, b: 128, alpha: 0.4 }` | 🟪 | Fourth most recent |
| 5+ items | 🟫 Brown | `{ r: 139, g: 69, b: 19, alpha: 0.4 }` | 🟫 | Generic overflow color |

**No overlay**: ⬜ White square emoji (represents normal access)

### Item Sorting Algorithm

**Priority Order**:
1. **By `lastModified` timestamp** (descending - most recent first)
2. **By item name** (alphabetical - A to Z) if no timestamp exists

**Implementation**:
```javascript
// Sort reverse blacklist items by priority
const sortedItems = reverseBlacklistItems.sort((a, b) => {
  // Get lastModified timestamps from safariContent.items[itemId].metadata.lastModified
  const timestampA = a.metadata?.lastModified || 0;
  const timestampB = b.metadata?.lastModified || 0;

  // Sort by timestamp descending (most recent first)
  if (timestampA !== timestampB) {
    return timestampB - timestampA;
  }

  // Fallback: alphabetical by name
  return a.name.localeCompare(b.name);
});

// Assign colors based on sorted order
const itemColorMap = new Map();
sortedItems.forEach((item, index) => {
  if (index < 4) {
    itemColorMap.set(item.id, COLOR_PALETTE[index]);  // Unique colors
  } else {
    itemColorMap.set(item.id, COLOR_PALETTE.OVERFLOW);  // Brown
  }
});
```

### Overlap Resolution Logic

**Problem**: A single cell may be unlocked by multiple items. Which color should be drawn?

**Solution**: Draw the color of the **highest-priority item** (earliest in sorted order).

**Algorithm**:
```javascript
// For each blacklisted coordinate, determine which item "wins"
const coordToItemMap = new Map();  // coord -> itemId (highest priority)

for (const item of sortedItems) {
  for (const coord of item.reverseBlacklist) {
    // Only set if not already claimed (first item wins)
    if (!coordToItemMap.has(coord)) {
      coordToItemMap.set(coord, item.id);
    }
  }
}

// Draw overlays using the winning item's color
for (const [coord, itemId] of coordToItemMap) {
  const color = itemColorMap.get(itemId);
  const overlay = createColoredOverlay(coord, color);
  overlays.push(overlay);
}
```

**Example**:
```
Items (sorted by priority):
1. Double-Hulled Canoe (lastModified: 1760767039890) → 🟩 Green
2. Flying Canoe (lastModified: 1760766000000) → 🟧 Orange

Coordinate C5 is unlocked by BOTH items:
→ Draw GREEN (Double-Hulled Canoe is higher priority)

Coordinate A3 is unlocked ONLY by Flying Canoe:
→ Draw ORANGE
```

### Legend Generation

**Dynamic Legend Format**:
```
**Legend:**
🟥 Red overlay = Blacklisted (impossible to pass)
🟩 Green overlay = ⛵ Double-Hulled Voyaging Canoe
🟧 Orange overlay = 🛶 Va'a Lele (Flying Canoe)
⬜ No overlay = Normal access

**Reverse Blacklist Items:**
• ⛵ Double-Hulled Voyaging Canoe: C5, D5, E5, F5, G5
• 🛶 Va'a Lele (Flying Canoe): A3, B3, C3, D3, G3, D2, E2, E1, F1, G1, G2
```

**With 5+ Items (Overflow)**:
```
**Legend:**
🟥 Red overlay = Blacklisted (impossible to pass)
🟩 Green overlay = ⛵ Item A (most recent)
🟧 Orange overlay = 🌊 Item B
🟨 Yellow overlay = 🏝️ Item C
🟪 Purple overlay = 🗿 Item D
🟫 Brown overlay = Reverse blacklist unlock (various items)
⬜ No overlay = Normal access

**Reverse Blacklist Items:**
• ⛵ Item A: C5, D5
• 🌊 Item B: A3, B3
• 🏝️ Item C: E1, F1
• 🗿 Item D: G7
• 🎋 Item E: A1  // This one gets brown
• 🪶 Item F: B2  // This one gets brown
```

**Legend Generation Logic**:
```javascript
function generateLegend(sortedItems, itemColorMap) {
  const legendLines = ['**Legend:**', '🟥 Red overlay = Blacklisted (impossible to pass)'];

  // Add color lines for first 4 items
  const colorEmojis = ['🟩', '🟧', '🟨', '🟪'];
  sortedItems.slice(0, 4).forEach((item, index) => {
    legendLines.push(`${colorEmojis[index]} ${colorEmojis[index]} overlay = ${item.emoji} ${item.name}`);
  });

  // Add brown overflow line if 5+ items
  if (sortedItems.length >= 5) {
    legendLines.push('🟫 Brown overlay = Reverse blacklist unlock (various items)');
  }

  legendLines.push('⬜ No overlay = Normal access');

  // Add reverse blacklist items section
  legendLines.push('', '**Reverse Blacklist Items:**');
  sortedItems.forEach(item => {
    const coords = item.reverseBlacklist.join(', ');
    legendLines.push(`• ${item.emoji} ${item.name}: ${coords}`);
  });

  return legendLines.join('\n');
}
```

### Visual Example

**Map with 2 Items**:
```
    A    B    C    D    E    F    G
1  [ ]  [ ]  [ ]  [ ]  🟧  🟧  🟧   (Flying Canoe)
2  [ ]  [ ]  [ ]  🟧  🟧  [ ]  🟧   (Flying Canoe)
3  🟧  🟧  🟧  🟧  [ ]  [ ]  🟧   (Flying Canoe)
4  [ ]  [ ]  [ ]  [ ]  [ ]  [ ]  [ ]
5  [ ]  [ ]  🟩  🟩  🟩  🟩  🟩   (Double-Hulled Canoe)
6  [ ]  [ ]  [ ]  [ ]  [ ]  [ ]  [ ]
7  [ ]  [ ]  [ ]  [ ]  [ ]  [ ]  [ ]

Legend:
🟥 Red = Blacklisted (drawn under green/orange)
🟩 Green = Double-Hulled Canoe (priority 1 - most recent)
🟧 Orange = Flying Canoe (priority 2)
```

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
 * Generate a map image with blacklist overlays (multi-color enhancement)
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

    // Color palette for reverse blacklist items
    const COLOR_PALETTE = [
      { r: 0, g: 255, b: 0, alpha: 0.4, emoji: '🟩', name: 'Green' },    // 1st item
      { r: 255, g: 165, b: 0, alpha: 0.4, emoji: '🟧', name: 'Orange' }, // 2nd item
      { r: 255, g: 255, b: 0, alpha: 0.4, emoji: '🟨', name: 'Yellow' }, // 3rd item
      { r: 128, g: 0, b: 128, alpha: 0.4, emoji: '🟪', name: 'Purple' }, // 4th item
    ];
    const OVERFLOW_COLOR = { r: 139, g: 69, b: 19, alpha: 0.4, emoji: '🟫', name: 'Brown' };

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

    // Step 4: Get reverse blacklist items WITH metadata
    const { getReverseBlacklistItemSummary } = await import('./playerLocationManager.js');
    const reverseBlacklistItems = await getReverseBlacklistItemSummary(guildId);

    // Step 5: Sort items by priority (lastModified desc, then alphabetical)
    const sortedItems = reverseBlacklistItems.sort((a, b) => {
      const timestampA = a.metadata?.lastModified || 0;
      const timestampB = b.metadata?.lastModified || 0;

      if (timestampA !== timestampB) {
        return timestampB - timestampA;  // Most recent first
      }

      return a.name.localeCompare(b.name);  // Alphabetical fallback
    });

    console.log(`🔓 Found ${sortedItems.length} reverse blacklist items (sorted by priority)`);

    // Step 6: Assign colors to items based on priority
    const itemColorMap = new Map();
    sortedItems.forEach((item, index) => {
      const color = index < 4 ? COLOR_PALETTE[index] : OVERFLOW_COLOR;
      itemColorMap.set(item.id, color);
      console.log(`  ${index + 1}. ${item.emoji} ${item.name} → ${color.emoji} ${color.name}`);
    });

    // Step 7: Resolve overlapping coordinates (highest priority wins)
    const coordToItemMap = new Map();  // coord -> item
    for (const item of sortedItems) {
      for (const coord of item.coordinates || item.reverseBlacklist || []) {
        if (!coordToItemMap.has(coord)) {
          coordToItemMap.set(coord, item);
        }
      }
    }

    console.log(`🎨 Resolved ${coordToItemMap.size} unique coordinate overlays`);

    // Step 8: Create overlay rectangles
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

    // Red overlay for blacklisted cells (drawn first, underneath colored overlays)
    for (const coord of blacklistedCoords) {
      const pos = coordToPosition(coord);

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

    // Colored overlays for reverse blacklist unlocks (drawn on top of red)
    for (const [coord, item] of coordToItemMap) {
      if (blacklistedCoords.includes(coord)) {
        const pos = coordToPosition(coord);
        const color = itemColorMap.get(item.id);

        const coloredOverlay = await sharp({
          create: {
            width: Math.floor(cellWidth),
            height: Math.floor(cellHeight),
            channels: 4,
            background: color
          }
        }).png().toBuffer();

        overlays.push({
          input: coloredOverlay,
          top: pos.top,
          left: pos.left
        });
      }
    }

    console.log(`🎨 Created ${overlays.length} overlay rectangles`);

    // Step 9: Composite all overlays onto the original image
    const overlaidImage = await sharp(imageBuffer)
      .composite(overlays)
      .png()
      .toBuffer();

    // Step 10: Save to temporary file
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `map_overlay_${guildId}_${Date.now()}.png`);
    await sharp(overlaidImage).toFile(tempFilePath);

    console.log(`💾 Saved overlaid image to: ${tempFilePath}`);

    // Step 11: Upload to Discord and get CDN URL
    const guild = await client.guilds.fetch(guildId);
    const discordUrl = await uploadImageToDiscord(guild, tempFilePath, `map_overlay_${Date.now()}.png`);

    // Step 12: Clean up temporary file
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

#### Step 3: Generate Dynamic Multi-Color Legend

**Update the Map Explorer response to include a dynamic legend showing per-item colors:**

```javascript
/**
 * Generate dynamic legend with per-item color coding
 *
 * @param {Array} sortedItems - Reverse blacklist items sorted by priority
 * @param {Map} itemColorMap - Map of itemId -> color object
 * @returns {string} Formatted legend text
 */
function generateMultiColorLegend(sortedItems, itemColorMap) {
  const legendLines = ['**Legend:**', '🟥 Red overlay = Blacklisted (impossible to pass)'];

  // Add color lines for first 4 items (unique colors)
  const colorEmojis = ['🟩', '🟧', '🟨', '🟪'];
  sortedItems.slice(0, 4).forEach((item, index) => {
    const emoji = colorEmojis[index];
    legendLines.push(`${emoji} ${emoji} overlay = ${item.emoji} ${item.name}`);
  });

  // Add brown overflow line if 5+ items
  if (sortedItems.length >= 5) {
    legendLines.push('🟫 Brown overlay = Reverse blacklist unlock (various items)');
  }

  legendLines.push('⬜ No overlay = Normal access');

  // Add reverse blacklist items section
  legendLines.push('', '**Reverse Blacklist Items:**');
  sortedItems.forEach(item => {
    const coords = (item.coordinates || item.reverseBlacklist || []).join(', ');
    legendLines.push(`• ${item.emoji} ${item.name}: ${coords}`);
  });

  return legendLines.join('\n');
}

// In the Map Explorer button handler:
const legendContent = generateMultiColorLegend(sortedItems, itemColorMap);

// In the container components array:
{
  type: 10,  // Text Display
  content: legendContent
}
```

**Example Output** (2 items):
```
**Legend:**
🟥 Red overlay = Blacklisted (impossible to pass)
🟩 🟩 overlay = ⛵ Double-Hulled Voyaging Canoe
🟧 🟧 overlay = 🛶 Va'a Lele (Flying Canoe)
⬜ No overlay = Normal access

**Reverse Blacklist Items:**
• ⛵ Double-Hulled Voyaging Canoe: C5, D5, E5, F5, G5
• 🛶 Va'a Lele (Flying Canoe): A3, B3, C3, D3, G3, D2, E2, E1, F1, G1, G2
```

**Example Output** (5+ items):
```
**Legend:**
🟥 Red overlay = Blacklisted (impossible to pass)
🟩 🟩 overlay = ⛵ Item A
🟧 🟧 overlay = 🌊 Item B
🟨 🟨 overlay = 🏝️ Item C
🟪 🟪 overlay = 🗿 Item D
🟫 Brown overlay = Reverse blacklist unlock (various items)
⬜ No overlay = Normal access

**Reverse Blacklist Items:**
• ⛵ Item A: C5, D5
• 🌊 Item B: A3, B3
• 🏝️ Item C: E1, F1
• 🗿 Item D: G7
• 🎋 Item E: A1
• 🪶 Item F: B2
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

**Basic Functionality**:
1. **Empty Blacklist**: No overlays, returns original image
2. **Blacklist Only**: Red overlays on restricted cells, no colored overlays
3. **Reverse Blacklist Only**: No visual change (colors only show where red exists)
4. **Both Blacklist and Reverse**: Red cells with colored overlays on unlocked cells

**Multi-Color Scenarios**:
5. **Single Item**: Red + single green overlay, legend shows only green
6. **Two Items**: Red + green/orange overlays based on priority
7. **Four Items**: All 4 unique colors used (green, orange, yellow, purple)
8. **Five+ Items**: First 4 get unique colors, remaining get brown, legend shows "various items"
9. **Overlapping Coordinates**: Cell unlocked by multiple items shows highest-priority item's color
10. **No lastModified**: Items sorted alphabetically, colors assigned in A-Z order

**Edge Cases**:
11. **Performance**: Verify <3 second response time (even with 10+ items)
12. **Error Handling**: Simulate fetch failure, verify fallback to original
13. **Large Grids**: Test with 15x15, 20x20 maps
14. **Invalid Coordinates**: Skip coordinates outside grid bounds

### Manual Testing Steps

**Setup**:
1. Configure blacklisted cells: `/menu` → Safari → Map Admin → Blacklist
2. Create 2-3 items with reverse blacklist: `/menu` → Safari → Items → [Item] → Movement
3. Modify item timestamps by editing items (triggers `lastModified` update)

**Test Execution**:
4. Click Map Explorer button in Safari menu
5. Verify deferred "thinking" message appears
6. Wait for map to load (should be <3 seconds)

**Visual Verification**:
7. **Red overlays**: All blacklisted cells have semi-transparent red
8. **Colored overlays**: Cells with reverse blacklist unlocks have colored overlays
9. **Color assignment**: Most recently modified item has green, second has orange, etc.
10. **Overlap handling**: Cells unlocked by multiple items show the highest-priority item's color

**Legend Verification**:
11. **Color legend**: Each item (up to 4) has a unique color line with emoji and name
12. **Overflow legend**: If 5+ items, brown line shows "various items"
13. **Item list**: All items listed with their coordinates
14. **Ordering**: Items appear in priority order (lastModified desc, then alphabetical)

**Performance Check**:
15. Monitor logs for timing: Total should be ~1-2 seconds
16. Check overlay rectangle count: Should be blacklisted cells + unique reverse blacklist coords

## Edge Cases & Validation

**Coordinate Handling**:
1. **Invalid Coordinates**: Skip coordinates that don't exist on the grid (outside A-Z, 1-gridSize)
2. **Duplicate Coordinates**: Multiple items unlock same cell → highest priority wins
3. **Grid Size Mismatch**: Use metadata dimensions, not assumed grid size

**Item Handling**:
4. **No Reverse Blacklist Items**: Only show red overlays, skip colored overlays
5. **All Items Same Timestamp**: Fall back to alphabetical sorting
6. **Missing Item Metadata**: Treat `lastModified` as 0, sort alphabetically
7. **Item Without Emoji**: Use placeholder emoji (⚫) in legend

**Performance & Concurrency**:
8. **Large Grids (20x20+)**: May take slightly longer but should still complete <3s
9. **Many Items (10+)**: Sorting and color assignment is O(n log n), acceptable performance
10. **Concurrent Requests**: Each request generates its own overlay (no shared state issues)

**Error Scenarios**:
11. **Missing Original Image**: Return error, don't crash (fallback to original URL)
12. **Sharp Failure**: Catch error, log, return original image URL
13. **Upload Failure**: Retry once, then fall back to original URL

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

### Phase 1: Core Overlay (IMPLEMENTED ✅)

- [x] Modify `safari_map_explorer` handler to use deferred pattern
- [x] Create `generateBlacklistOverlay()` function in `mapExplorer.js`
- [x] Add legend to Map Explorer UI
- [x] Test with empty blacklist (should show original)
- [x] Test with blacklist only (should show red)
- [x] Test with reverse blacklist (shows colored overlays on red)

### Phase 2: Multi-Color Enhancement (DOCUMENTED, PENDING IMPLEMENTATION)

**Core Implementation** (2-3 hours):
- [ ] Add COLOR_PALETTE constant to `generateBlacklistOverlay()`
- [ ] Implement item sorting algorithm (lastModified desc → alphabetical)
- [ ] Implement color assignment logic (first 4 unique, 5+ brown)
- [ ] Implement overlap resolution (highest priority wins)
- [ ] Update overlay generation loop to use per-item colors
- [ ] Create `generateMultiColorLegend()` helper function
- [ ] Update Map Explorer handler to call new legend function
- [ ] Ensure `getReverseBlacklistItemSummary()` includes item metadata

**Testing** (1-2 hours):
- [ ] Test with 1 item (should show green only)
- [ ] Test with 2 items (green + orange, verify priority sorting)
- [ ] Test with 4 items (all unique colors)
- [ ] Test with 5+ items (verify brown overflow color)
- [ ] Test overlapping coordinates (verify highest priority wins)
- [ ] Test items without `lastModified` (verify alphabetical fallback)
- [ ] Test legend generation (verify correct emojis and ordering)

**Edge Cases & Polish** (1 hour):
- [ ] Add error handling for missing item metadata
- [ ] Test performance with 10+ items
- [ ] Verify logging shows color assignments
- [ ] Test with large grids (15x15, 20x20)
- [ ] Add coordinate validation (skip out-of-bounds coords)

### Phase 3: Documentation (30 min)

- [ ] Update SafariMapSystem.md with multi-color overlay feature
- [ ] Add usage instructions for admins
- [ ] Document color meanings and priority logic in user guide
- [ ] Add screenshots of multi-color legend examples

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
A: Red 30% for blacklisted cells, 40% for colored item overlays (on top of red, needs higher opacity).

**Q: Should we show legend?**
A: Yes, add text display component with dynamic multi-color legend.

**Q: How many unique colors should we support?**
A: 4 unique colors (green, orange, yellow, purple), then brown for 5+ items. This balances visual clarity with practical limits.

**Q: How should we handle overlapping coordinates?**
A: Draw the color of the highest-priority item (earliest in sorted order by lastModified → alphabetical).

**Q: What if an item has no `lastModified` timestamp?**
A: Treat as timestamp 0, will be sorted after items with timestamps, then alphabetically.

**Q: Should we show all items in the legend even if they use brown?**
A: Yes, the **color legend** shows up to 4 unique colors + brown overflow, but the **item list** shows ALL items with their coordinates.

**Q: What if two items have the exact same `lastModified` timestamp?**
A: Fall back to alphabetical sorting by item name.

---

**Document Version**: 2.0
**Created**: 2024-10-16
**Last Updated**: 2025-01-16
**Status**: Phase 1 Implemented (Core Overlay), Phase 2 Documented (Multi-Color Enhancement Pending)
