# RaP 0973: Shared Map Explorer Feature

**Created**: 2025-11-16
**Status**: Design Complete, Ready for Implementation
**Complexity**: Medium (4-6 hours)
**Risk Level**: Low (pattern reuse, isolated feature)

## 🎯 Original Context / Trigger Prompt

**User Request**:
> "Could you come up with a design for me that:
> Adds a grey button to safari_map_explorer to the right of safari_progress called "Prod Shared Map" (Map Emoji)
> On click, it executes identically to the Map Explorer button (safari_map_explorer) EXCEPT it is _not_ ephemeral, e.g. it posts in the channel the button was clicked in, as a separate, new message. Upon interacting with any of the buttons in the non-ephemeral message (e.g. Location Editor etc), they revert to their behaviour under safari_map_explorer e.g. they clicking Location Editor would bring up the standard ephemeral safari_location_editor message"

## 🤔 Problem Statement (Plain English)

**What's Actually Needed**:
Admins want to share the current map visualization with their team in a public channel message, but still keep the admin tools (Location Editor, Blacklist, etc.) private when they click on them from the shared map.

**The "Two Views" Pattern**:
- **Private View** (current): Admin sees map ephemerally, clicks buttons → stays ephemeral
- **Public View** (new): Admin shares map publicly, team sees it, admin clicks buttons → goes ephemeral

Think of it like presenting slides to a team (public) while having presenter notes (private) that appear when you click controls.

## 🏛️ Historical Context

**Why This Feature Exists**:
The Map Explorer (`safari_map_explorer`) was originally built as an admin-only tool with `ephemeral: true`. This works great for private map management, but creates a problem:

1. **Team Communication**: Admins want to show the team the current map layout
2. **Current Workaround**: Screenshot and paste (loses interactivity, outdated quickly)
3. **Better Solution**: Share live map view publicly, keep admin tools private

**The ButtonHandlerFactory Evolution**:
- Early handlers mixed `ephemeral` and `updateMessage` flags incorrectly
- Common mistake: Using `ephemeral: true` for button clicks (wrong - creates new message)
- Correct pattern: Use `updateMessage: true` for button clicks (updates existing)
- This feature leverages the correct understanding of these flags

## 📊 Current Implementation Analysis

### Existing Map Explorer Flow

```
User clicks Map Admin button (ephemeral: true)
    ↓
safari_map_explorer handler executes
    ↓
ButtonHandlerFactory.create({
    ephemeral: true,        // Creates NEW ephemeral message
    deferred: true,         // Allows 1-2 sec overlay generation
    updateMessage: false    // (default) Creates new message
})
    ↓
Generates overlay image (Sharp + Discord CDN)
    ↓
Returns Components V2 Container with:
    - Map image (Media Gallery)
    - Multi-color legend (Text Display)
    - Admin buttons (Location Editor, Blacklist, etc.)
    ↓
User sees map privately (ephemeral)
```

### What Happens When Buttons Are Clicked

```javascript
// Location Editor button in the map
custom_id: 'safari_location_editor'

// Handler for Location Editor (separate from map explorer)
ButtonHandlerFactory.create({
  id: 'safari_location_editor',
  ephemeral: true,         // Creates new ephemeral message
  // ...
})
```

**Key Discovery**: Child button handlers are INDEPENDENT. They have their own `ephemeral` settings. This means:
- Buttons in shared map → still use their own `ephemeral: true` configs
- No special handling needed for "ephemeral cascade"
- It "just works" due to separation of concerns

## 💡 Solution Design

### Architecture: Extract and Reuse Pattern

**The Problem with Copy-Paste**:
```javascript
// ❌ BAD: Duplicate the entire handler
} else if (custom_id === 'safari_map_explorer_shared') {
  // Copy 200 lines of map generation logic
  // Now we have TWO places to update when map logic changes
}
```

**The Solution: Extract Shared Function**:
```javascript
// ✅ GOOD: Single source of truth
// mapExplorer.js
export async function buildMapExplorerResponse(guildId, client) {
  // All map generation logic here
  // Returns { components: [...] }
}

// app.js - Private view
handler: async (context) => {
  return await buildMapExplorerResponse(context.guildId, context.client);
}

// app.js - Public view
handler: async (context) => {
  return await buildMapExplorerResponse(context.guildId, context.client);
  // SAME function, different ephemeral/updateMessage flags!
}
```

### Components V2 Battle-Testing

**Critical Pitfalls to Avoid** (from ComponentsV2Issues.md):

#### Pitfall 1: ephemeral vs updateMessage Confusion
```javascript
// ❌ WRONG: Using ephemeral for button clicks
ButtonHandlerFactory.create({
  id: 'safari_map_explorer_shared',
  ephemeral: false,  // This creates NEW message, but wrong type!
  // Result: "This interaction failed"
})

// ✅ CORRECT: Use updateMessage for button clicks
ButtonHandlerFactory.create({
  id: 'safari_map_explorer_shared',
  updateMessage: false,  // Explicit: Create NEW message
  ephemeral: false,      // Explicit: Make it PUBLIC
  deferred: true         // Needed for overlay generation
})
```

**Why This Matters**:
- Button clicks expect UPDATE_MESSAGE (type 7) by default
- Creating NEW message requires `updateMessage: false` explicitly
- `ephemeral` flag controls visibility (private vs public)

#### Pitfall 2: Missing BUTTON_REGISTRY Entry
```javascript
// ❌ WRONG: Button not registered
// Result: Handler executes twice, Discord errors

// ✅ CORRECT: Add to buttonHandlerFactory.js
'safari_map_explorer_shared': {
  label: 'Prod Shared Map',
  description: 'Share map publicly in channel (not ephemeral)',
  emoji: '🗺️',
  style: 'Secondary',
  category: 'safari_map',
  parent: 'safari_map_explorer'
}
```

#### Pitfall 3: Components V2 Structure
```javascript
// ✅ ALWAYS return full Container structure
return {
  components: [{
    type: 17, // Container (mandatory)
    components: [
      { type: 10, content: '# 🗺️ Map Explorer...' },
      { type: 14 }, // Separator
      { type: 12, items: [{ media: { url: imageUrl } }] }, // Media Gallery
      { type: 10, content: legendContent },
      { type: 1, components: [buttons] } // Action Row
    ]
  }]
  // NO flags needed for UPDATE_MESSAGE
  // flags: (1 << 15) only for NEW messages with CHANNEL_MESSAGE_WITH_SOURCE
}
```

**CRITICAL**: For button clicks creating NEW messages, ButtonHandlerFactory handles flags automatically.

#### Pitfall 4: Deferred Response Pattern
```javascript
// ✅ REQUIRED: Overlay generation takes 1-2 seconds
ButtonHandlerFactory.create({
  id: 'safari_map_explorer_shared',
  deferred: true,  // Sends "thinking..." immediately
  handler: async (context) => {
    // Slow overlay generation happens here
    // Discord won't timeout (3-second limit bypassed)
  }
})
```

## 🔧 Implementation Steps

### Step 1: Extract Map Explorer Logic (30 min)

**File**: `mapExplorer.js`

**Current Code Location**: app.js, safari_map_explorer handler, lines ~24066-24200+

**Extract to**:
```javascript
/**
 * Build Map Explorer response (shared between ephemeral and public views)
 * @param {string} guildId - Guild ID
 * @param {Object} client - Discord client
 * @returns {Promise<Object>} Components V2 response object
 */
export async function buildMapExplorerResponse(guildId, client) {
  console.log(`🗺️ DEBUG: Opening Map Explorer interface for guild ${guildId}`);

  // Load safari content to check for existing maps
  const { loadSafariContent } = await import('./safariManager.js');
  const safariData = await loadSafariContent();
  const guildMaps = safariData[guildId]?.maps || {};
  const activeMapId = guildMaps.active;
  const hasActiveMap = activeMapId && guildMaps[activeMapId];

  // Create header text based on map status
  let headerText;
  if (hasActiveMap) {
    const activeMap = guildMaps[activeMapId];
    headerText = `# 🗺️ Map Explorer\n\n**Active Map:** ${activeMap.name || 'Adventure Map'}\n**Grid Size:** ${activeMap.gridSize}x${activeMap.gridSize}\n**Status:** Active ✅`;
  } else {
    headerText = `# 🗺️ Map Explorer\n\n**No active map found**\nCreate a new map to begin exploration!`;
  }

  // Build container components starting with text display
  const containerComponents = [
    {
      type: 10, // Text Display
      content: headerText
    },
    {
      type: 14 // Separator
    }
  ];

  // Add Media Gallery with overlay if there's an active map with Discord CDN URL
  if (hasActiveMap && guildMaps[activeMapId].discordImageUrl) {
    console.log(`🖼️ DEBUG: Generating blacklist overlay for map from Discord CDN: ${guildMaps[activeMapId].discordImageUrl}`);

    // Generate overlay image with blacklist indicators
    let imageUrl = guildMaps[activeMapId].discordImageUrl;
    try {
      const { generateBlacklistOverlay } = await import('./mapExplorer.js');
      imageUrl = await generateBlacklistOverlay(
        guildId,
        guildMaps[activeMapId].discordImageUrl,
        guildMaps[activeMapId].gridSize,
        client
      );
      console.log(`✅ Using overlaid image: ${imageUrl}`);
    } catch (error) {
      console.error(`❌ Error generating overlay, using original: ${error.message}`);
    }

    containerComponents.push({
      type: 12, // Media Gallery
      items: [
        {
          media: {
            url: imageUrl
          }
        }
      ]
    });

    // Generate multi-color legend with per-item color coding
    console.log(`🔍 DEBUG Map Explorer: Generating multi-color legend for guild ${guildId}`);

    let legendContent = '';

    // Get reverse blacklist items with metadata
    const { getReverseBlacklistItemSummary } = await import('./playerLocationManager.js');
    const reverseBlacklistItems = await getReverseBlacklistItemSummary(guildId);

    if (reverseBlacklistItems.length > 0) {
      // Define color palette (same as in generateBlacklistOverlay)
      const COLOR_PALETTE = [
        { r: 0, g: 255, b: 0, alpha: 0.4, emoji: '🟩', name: 'Green' },
        { r: 255, g: 165, b: 0, alpha: 0.4, emoji: '🟧', name: 'Orange' },
        { r: 255, g: 255, b: 0, alpha: 0.4, emoji: '🟨', name: 'Yellow' },
        { r: 128, g: 0, b: 128, alpha: 0.4, emoji: '🟪', name: 'Purple' },
      ];
      const OVERFLOW_COLOR = { r: 139, g: 69, b: 19, alpha: 0.4, emoji: '🟫', name: 'Brown' };

      // Sort items by priority (lastModified desc → alphabetical)
      const sortedItems = reverseBlacklistItems.sort((a, b) => {
        const timestampA = a.metadata?.lastModified || 0;
        const timestampB = b.metadata?.lastModified || 0;
        if (timestampA !== timestampB) {
          return timestampB - timestampA;
        }
        return a.name.localeCompare(b.name);
      });

      // Assign colors to items
      const itemColorMap = new Map();
      sortedItems.forEach((item, index) => {
        const color = index < 4 ? COLOR_PALETTE[index] : OVERFLOW_COLOR;
        itemColorMap.set(item.id, color);
      });

      // Get blacklisted coordinates for warning detection
      const { getBlacklistedCoordinates, generateMultiColorLegend } = await import('./mapExplorer.js');
      const blacklistedCoords = await getBlacklistedCoordinates(guildId);

      // Generate multi-color legend with warnings for non-blacklisted coords
      legendContent = generateMultiColorLegend(sortedItems, itemColorMap, blacklistedCoords);
    } else {
      // No reverse blacklist items - show basic legend
      legendContent = `**Legend:**
🟥 Red overlay = Blacklisted (restricted access)
⬜ No overlay = Normal access`;
    }

    console.log(`🔍 DEBUG Map Explorer: Generated legend with ${reverseBlacklistItems.length} items`);

    containerComponents.push({
      type: 10,  // Text Display
      content: legendContent
    });

    containerComponents.push({
      type: 14 // Separator
    });
  } else if (hasActiveMap && guildMaps[activeMapId].imageFile) {
    // Fallback for maps without Discord CDN URL
    console.log(`🖼️ DEBUG: Map exists but no Discord CDN URL: ${guildMaps[activeMapId].imageFile}`);
    containerComponents.push({
      type: 10, // Text Display
      content: `📍 **Map Image:** \`${guildMaps[activeMapId].imageFile.split('/').pop()}\``
    });
    containerComponents.push({
      type: 14 // Separator
    });
  }

  // Add Map Explorer menu (buttons)
  const mapExplorerMenu = await createMapExplorerMenu(guildId, client);
  containerComponents.push(...mapExplorerMenu.components);

  // Return complete response
  return {
    components: [{
      type: 17, // Container
      components: containerComponents
    }]
  };
}
```

**Extraction Checklist**:
- [ ] Copy entire handler body from safari_map_explorer
- [ ] Replace `context.guildId` with `guildId` parameter
- [ ] Replace `context.client` with `client` parameter
- [ ] Remove ButtonHandlerFactory-specific code (it returns response directly)
- [ ] Export the function
- [ ] Test that existing safari_map_explorer still works

### Step 2: Update Existing safari_map_explorer Handler (15 min)

**File**: `app.js` (line ~24055)

```javascript
} else if (custom_id === 'safari_map_explorer') {
  // Handle Map Explorer menu display - using Components V2 with Container (MIGRATED TO FACTORY)
  const shouldUpdateMessage = await shouldUpdateProductionMenuMessage(req.body.channel_id);

  return ButtonHandlerFactory.create({
    id: 'safari_map_explorer',
    requiresPermission: PermissionFlagsBits.ManageRoles,
    permissionName: 'Manage Roles',
    updateMessage: shouldUpdateMessage,
    ephemeral: true,
    deferred: true,  // Enable deferred response for overlay generation
    handler: async (context) => {
      // NEW: Call extracted function
      const { buildMapExplorerResponse } = await import('./mapExplorer.js');
      return await buildMapExplorerResponse(context.guildId, context.client);
    }
  })(req, res, client);
}
```

**CRITICAL**: Test this change BEFORE proceeding! Ensure existing Map Explorer still works.

### Step 3: Create New Shared Map Handler (15 min)

**File**: `app.js` (add after safari_map_explorer handler)

```javascript
} else if (custom_id === 'safari_map_explorer_shared') {
  // Handle SHARED Map Explorer (public view in channel)
  return ButtonHandlerFactory.create({
    id: 'safari_map_explorer_shared',
    requiresPermission: PermissionFlagsBits.ManageRoles,
    permissionName: 'Manage Roles',
    updateMessage: false,  // Create NEW message (not update existing)
    ephemeral: false,      // PUBLIC message (visible to everyone)
    deferred: true,        // Enable deferred response for overlay generation
    handler: async (context) => {
      // Call SAME function as private view
      const { buildMapExplorerResponse } = await import('./mapExplorer.js');
      return await buildMapExplorerResponse(context.guildId, context.client);
    }
  })(req, res, client);
}
```

**Key Differences from Private View**:
- `updateMessage: false` (create new, not update)
- `ephemeral: false` (public, not private)
- **SAME function call** (buildMapExplorerResponse)

### Step 4: Add Button to Map Explorer Menu (10 min)

**File**: `mapExplorer.js` (line ~877+, in createMapExplorerMenu function)

**Find the button row with safari_progress**:
```javascript
const progressButton = new ButtonBuilder()
  .setCustomId('safari_progress')
  .setLabel('Safari Progress')
  .setStyle(ButtonStyle.Secondary)
  .setEmoji('🚀');
```

**Add AFTER safari_progress button**:
```javascript
const sharedMapButton = new ButtonBuilder()
  .setCustomId('safari_map_explorer_shared')
  .setLabel('Prod Shared Map')
  .setStyle(ButtonStyle.Secondary)  // Grey
  .setEmoji('🗺️');
```

**Add to button row** (find where buttons are added to ActionRow):
```javascript
// Existing buttons row
const buttonsRow = new ActionRowBuilder().addComponents([
  createButton,
  uploadButton,
  deleteButton,
  blacklistButton,
  locationButton
]);

// Add to appropriate row (find where progressButton is added)
// Add sharedMapButton to same row
```

**Button Placement Analysis**:
Look at the button structure logs to find where safari_progress is placed, then add safari_map_explorer_shared in the same row.

### Step 5: Register in BUTTON_REGISTRY (5 min)

**File**: `buttonHandlerFactory.js`

**Add to BUTTON_REGISTRY object**:
```javascript
'safari_map_explorer_shared': {
  label: 'Prod Shared Map',
  description: 'Share map publicly in channel (not ephemeral)',
  emoji: '🗺️',
  style: 'Secondary',
  category: 'safari_map',
  parent: 'safari_map_explorer'
}
```

**CRITICAL**: This prevents the "handler executes twice" bug.

## 🧪 Testing Strategy

### Test Case 1: Private View Still Works
- [ ] Click "Map Admin" button in Production Menu
- [ ] Verify map appears ephemerally (only you see it)
- [ ] Verify overlay generation works (colored overlays)
- [ ] Verify legend shows correctly
- [ ] Click "Location Editor" → Verify ephemeral editor appears

### Test Case 2: Public View Works
- [ ] Click "Prod Shared Map" button in Map Explorer
- [ ] Verify "thinking..." message appears (deferred)
- [ ] Verify map appears in CHANNEL (everyone can see it)
- [ ] Verify overlay generation works (same as private view)
- [ ] Verify legend shows correctly (with warnings if applicable)

### Test Case 3: Ephemeral Cascade Works
- [ ] From shared map (public), click "Location Editor"
- [ ] Verify editor appears EPHEMERALLY (only you see it)
- [ ] From shared map, click "Blacklist"
- [ ] Verify modal appears (ephemeral context)
- [ ] Verify other users can see the shared map but NOT your editor

### Test Case 4: Performance
- [ ] Verify shared map generates in <3 seconds (deferred pattern)
- [ ] Check logs for overlay generation timing
- [ ] Verify no "This interaction failed" errors

### Test Case 5: Edge Cases
- [ ] No active map → Verify error message shows
- [ ] Map without Discord CDN URL → Verify fallback works
- [ ] Multiple admins share map → Each creates independent message
- [ ] Shared map with 5+ reverse blacklist items → Brown overflow appears

## ⚠️ Risk Assessment

**Low Risk** - This is primarily code reuse with flag differences.

### Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Extraction breaks existing Map Explorer | High | Low | Test private view FIRST before adding public |
| Components V2 issues | Medium | Low | Follow battle-tested patterns from this doc |
| Button registry missing | Medium | Low | Add to registry BEFORE testing |
| Ephemeral cascade broken | Low | Very Low | Child handlers independent, no changes needed |

## 📝 Implementation Checklist

- [ ] Read this entire document
- [ ] Extract buildMapExplorerResponse() to mapExplorer.js
- [ ] Update safari_map_explorer to call extracted function
- [ ] TEST private view (ensure nothing broke)
- [ ] Create safari_map_explorer_shared handler
- [ ] Add button to Map Explorer menu
- [ ] Register in BUTTON_REGISTRY
- [ ] TEST public view
- [ ] TEST ephemeral cascade from public view
- [ ] Commit with message: "Add Shared Map Explorer: public map view with ephemeral admin tools"
- [ ] Deploy to production (if tests pass)

## 🔗 Related Documentation

- **[ComponentsV2Issues.md](../docs/troubleshooting/ComponentsV2Issues.md)** - Battle-tested pitfalls
- **[ComponentsV2.md](../docs/standards/ComponentsV2.md)** - Components V2 reference
- **[ButtonHandlerFactory.md](../docs/enablers/ButtonHandlerFactory.md)** - Factory patterns
- **[MapBlacklistOverlay.md](../docs/features/MapBlacklistOverlay.md)** - Map overlay system

## 💭 Questions & Decisions Log

**Q: Should shared maps auto-refresh when data changes?**
A: No - they're snapshots. Users can click "Prod Shared Map" again for fresh view.

**Q: Should there be rate limiting?**
A: Not initially - admins only (ManageRoles permission), low abuse risk.

**Q: Can non-admins click buttons in shared map?**
A: No - child handlers (Location Editor, etc.) require ManageRoles permission.

**Q: Why extract function instead of copy-paste?**
A: DRY principle - map logic updates once, affects both views. Less maintenance.

**Q: What if overlay generation fails?**
A: Falls back to original image (already handled in buildMapExplorerResponse).

---

**Document Version**: 1.0
**Implementation Time**: 4-6 hours
**Battle-Tested**: Yes (against ComponentsV2Issues.md)
**Ready for Implementation**: ✅ Yes
