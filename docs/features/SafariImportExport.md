# Safari Import/Export System

**Status:** ✅ PRODUCTION READY
**Deployed:** 2025-10-19
**Version:** 2.0
**File:** `safariImportExport.js`

---

## Overview

Safari Import/Export enables full Safari template portability between servers. Users can export complete Safari configurations (stores, items, maps, Custom Actions, settings) as JSON and import them into other servers, enabling template sharing, cross-server migration, and backup/restore workflows.

### Key Features

✅ **Full Data Export** - Stores, items, maps, Custom Actions, and complete Safari configuration
✅ **Smart Merge Import** - Updates existing data, creates new entries, preserves runtime state
✅ **Ghost Map Fix** - Import merges into active map instead of creating duplicates
✅ **Limit Reset** - Custom Action rewards reset for new server (claimable again)
✅ **Complete Config** - All 15 Safari settings transfer (inventory emoji, stamina, etc.)
✅ **Audit Trail** - Raw imports stored in #map-storage channel
✅ **Channel Preservation** - Import preserves existing Discord channels and anchor messages

---

## Implementation Status

### ✅ Implemented Features

#### **Phase 0: Refresh Anchors "All"** (COMPLETE)
- Manual anchor refresh workflow for post-import updates
- Supports typing "All" to refresh every anchor in server
- Uses modern Label component (Type 18) pattern
- **Location:** `safariMapAdmin.js:761-844`

#### **Phase 1: Custom Actions Export** (COMPLETE)
- Filters Custom Actions for export (removes runtime metadata)
- Exports action sequences, triggers, conditions, coordinates
- **Removes:** `claimedBy` tracking (resets limits for new server)
- Preserves tags for organization
- **Location:** `safariImportExport.js:516-581`

#### **Phase 2: Custom Actions Import** (COMPLETE)
- Smart merge logic (update existing, create new)
- Preserves runtime metadata (usageCount, createdAt) for existing actions
- **Initializes:** Fresh `claimedBy` tracking (null or [] based on limit type)
- Preserves coordinates as-is
- **Location:** `safariImportExport.js:312-359`

#### **Phase 2.5: Ghost Map Fix** (COMPLETE - 2025-10-19)
- Import now targets active map instead of matching by ID
- Merges imported data into existing map with channels
- Preserves channelId, anchorMessageId, navigation, fogMapUrl
- Shows warning when map IDs don't match
- **Location:** `safariImportExport.js:217-310`

#### **Phase 2.6: Complete Config Export** (COMPLETE - 2025-10-19)
- Exports all 15 Safari configuration fields
- Added: inventoryEmoji, defaultStartingCurrencyValue, stamina settings, global commands button
- Excludes: currentRound, lastRoundTimestamp, safariLogChannelId (runtime/server-specific)
- **Location:** `safariImportExport.js:484-514`

#### **Phase 2.7: Raw Import Storage** (COMPLETE - 2025-10-19)
- Uploads raw import JSON to #map-storage channel before processing
- Creates embed with metadata (who, when, what, file size)
- Non-blocking - import continues even if storage fails
- **Location:** `safariImportExport.js:35-116`

### 📅 Deferred Features

#### **Phase 3: Automatic Anchor Regeneration** (DEFERRED)
**Status:** Intentionally deferred in favor of manual workflow

**Why deferred:**
- Phase 0 provides atomic "refresh all" function
- User has full control over timing
- Simpler implementation path
- Avoids edge cases with missing channels/messages

**Manual workflow:**
1. User creates map with matching coordinates
2. User imports Safari data
3. User opens Map Explorer → Refresh Anchors → Types "All"
4. All anchor messages regenerate with imported Custom Actions

**Design available if needed:** See original implementation doc for automatic queue design

---

## User Workflow

### Export Safari Data

**Steps:**
1. Production Menu → Safari Admin → Export Safari
2. Download JSON file

**What's exported:**
- Stores (filtered: id, name, emoji, description, items, storeownerText)
- Items (filtered: id, name, description, emoji, category, prices, game mechanics)
- Maps (filtered: baseContent, buttons, cellType, stores, hiddenCommands, specialEvents)
- Custom Actions (filtered: actions with limits reset, coordinates, config)
- Safari Config (all 15 settings)

**What's excluded:**
- Runtime metadata (createdBy, createdAt, usageCount)
- Discord-specific fields (channelId, anchorMessageId, navigation, fogMapUrl)
- Limit tracking (claimedBy - reset on import)
- Server-specific config (safariLogChannelId)

### Import Safari Data

**Steps:**
1. **First:** Create map structure (Production Menu → Map Explorer → Create/Update Map)
   - Upload map image
   - Generate Discord channels (A1-G7)
2. **Then:** Import data (Production Menu → Safari Admin → Import Safari)
   - Upload exported JSON file
   - Review import summary
3. **Finally:** Refresh anchors (Map Explorer → Refresh Anchors → Type "All")
   - Wait 5-10 seconds for batch update

**What happens:**
- Raw JSON uploaded to #map-storage (audit trail)
- Data merged into active map (preserves channels)
- Stores/items created or updated
- Custom Actions created or updated (limits reset)
- Safari config updated (all settings)
- Import summary shows what changed

**Import summary example:**
```
✅ Import completed successfully!

🏪 Stores: 2 created
📦 Items: 7 created
🗺️ Maps: 1 updated
🔘 Custom Actions: 3 created

⚠️ Warnings:
   • Map ID mismatch: Import merged into active map
     (Imported: map_7x7_1758651530323, Active: map_7x7_1760850845768)
```

---

## Technical Details

### Export Filter Functions

**`filterStoresForExport(stores)`**
- Preserves: id, name, emoji, description, items, storeownerText
- Excludes: metadata, totalSales, accentColor, requiresRole

**`filterItemsForExport(items)`**
- Preserves: id, name, description, emoji, category, prices, game mechanics
- Excludes: metadata, totalSold

**`filterMapsForExport(maps)`**
- Preserves: baseContent, buttons, cellType, stores, hiddenCommands, specialEvents, blacklistedCoordinates
- Excludes: channelId, anchorMessageId, navigation, fogMapUrl

**`filterConfigForExport(config)`**
- Exports all 15 config fields (currency, inventory, events, probabilities, stamina, player menu)
- Excludes: currentRound, lastRoundTimestamp, safariLogChannelId

**`filterActionForExport(action)`**
- Preserves: type, order, config (without claimedBy), executeOn
- Removes: limit.claimedBy (runtime tracking)

**`filterCustomActionsForExport(buttons)`**
- Maps over all actions to filter each one
- Preserves: id, name, label, emoji, style, trigger, conditions, coordinates, tags
- Excludes: createdBy, createdAt, lastModified, usageCount, claimedBy

### Import Helper Functions

**`initializeActionLimitTracking(action)`**
- Initializes fresh claimedBy based on limit type:
  - `once_globally`: Sets `claimedBy: null`
  - `once_per_player`: Sets `claimedBy: []`
  - `unlimited`: No claimedBy field

**`storeRawImport(guildId, importJson, importData, context)`**
- Uploads JSON to #map-storage channel
- Creates embed with metadata
- Non-blocking (won't fail import)

### Import Merge Logic

**Maps:**
- Finds active map by `maps.active` pointer
- Merges imported data into active map (NOT matching by ID)
- Preserves runtime fields: channelId, anchorMessageId, navigation, fogMapUrl
- Updates config fields: baseContent, buttons, stores, cellType, etc.
- Tracks ID mismatch in warnings array

**Stores & Items:**
- Updates if ID exists (preserves totalSales/totalSold)
- Creates if ID is new (initializes fresh metadata)

**Custom Actions:**
- Maps actions through `initializeActionLimitTracking` (resets limits)
- Updates if ID exists (preserves usageCount, createdAt)
- Creates if ID is new (null creator, 0 usage)

**Config:**
- Merges imported config with existing
- Preserves runtime fields: currentRound, lastRoundTimestamp

---

## Data Structures

### Export Format

```json
{
  "stores": {
    "store_id": {
      "id": "store_id",
      "name": "Store Name",
      "emoji": "🏪",
      "description": "Store description",
      "items": ["item_id1", "item_id2"],
      "settings": {
        "storeownerText": "Welcome!"
      }
    }
  },
  "items": {
    "item_id": {
      "id": "item_id",
      "name": "Item Name",
      "description": "Item description",
      "emoji": "📦",
      "category": "tool",
      "basePrice": 100,
      "maxQuantity": 5,
      "goodOutcomeValue": 10,
      "attackValue": 5
    }
  },
  "safariConfig": {
    "currencyName": "Pokedollars",
    "currencyEmoji": "💷",
    "inventoryName": "Backpack",
    "inventoryEmoji": "🎒",
    "defaultStartingCurrencyValue": 100,
    "goodEventName": "Clear Skies",
    "goodEventEmoji": "☀️",
    "badEventName": "Meteor Strike",
    "badEventEmoji": "☄️",
    "round1GoodProbability": 0.75,
    "round2GoodProbability": 0.5,
    "round3GoodProbability": 0.25,
    "staminaRegenerationMinutes": 720,
    "maxStamina": 3,
    "showGlobalCommandsButton": true
  },
  "maps": {
    "active": "map_7x7_1758651530323",
    "map_7x7_1758651530323": {
      "id": "map_7x7_1758651530323",
      "name": "Adventure Island",
      "gridSize": "7x7",
      "blacklistedCoordinates": ["A1", "A2"],
      "coordinates": {
        "C3": {
          "baseContent": {
            "title": "📍 C3 | Pokemart",
            "description": "Who runs the Pokemart?",
            "image": "https://...",
            "clues": []
          },
          "buttons": [],
          "cellType": "unexplored",
          "discovered": false,
          "stores": ["pokemart_481320"],
          "hiddenCommands": {},
          "specialEvents": []
        }
      }
    }
  },
  "customActions": {
    "pick_bulbasaur_283998": {
      "id": "pick_bulbasaur_283998",
      "name": "Pick Bulbasaur",
      "label": "Pick Bulbasaur",
      "emoji": "🌱",
      "style": 3,
      "actions": [
        {
          "type": "give_item",
          "order": 0,
          "config": {
            "itemId": "bulbasaur_449582",
            "quantity": 1,
            "limit": {
              "type": "once_per_player"
              // NO claimedBy - filtered for export
            }
          },
          "executeOn": "true"
        }
      ],
      "trigger": {
        "type": "button",
        "button": { "label": "Pick Bulbasaur", "emoji": "🌱", "style": "Success" }
      },
      "conditions": {
        "logic": "AND",
        "items": []
      },
      "coordinates": ["E4"],
      "metadata": {
        "tags": ["starter", "pokemon"]
      }
    }
  }
}
```

---

## Edge Cases & Error Handling

### Map ID Mismatch (FIXED)
**Problem:** Imported map has different ID than existing map
**Solution:** Import targets active map, shows warning
**Result:** Only one map exists, data merged correctly

### Custom Action Limit Already Claimed (FIXED)
**Problem:** Exported claimedBy made rewards unusable
**Solution:** Export filters claimedBy, import initializes fresh
**Result:** Rewards work in new server

### Missing Safari Config Fields (FIXED)
**Problem:** Inventory emoji, stamina not exported
**Solution:** Export includes all 15 fields
**Result:** Complete Safari setup transfers

### No #map-storage Channel
**Problem:** Raw import can't be stored
**Solution:** Non-blocking - logs warning, continues import
**Result:** Import succeeds, just no audit trail

### Invalid Coordinates in Custom Actions
**Problem:** Custom Action references coordinate not in map
**Solution:** Import preserves coordinates as-is (user creates matching map)
**Result:** Non-breaking - just won't show until coordinate exists

---

## Performance Considerations

### Export Performance
- Current: ~25KB for basic Safari, ~100KB for full Safari
- Impact: Negligible - well under Discord file limits (8MB)

### Import Performance
- Bottleneck: None - direct JSON parse and merge
- Anchor updates: Manual workflow (user triggers when ready)
- User Experience: Instant import, 5-10s for anchor refresh

---

## Testing

### Test Coverage
✅ Export includes all data types
✅ Export filters runtime fields correctly
✅ Export removes limit tracking (claimedBy)
✅ Import creates fresh server successfully
✅ Import merges into existing server
✅ Import handles map ID mismatch
✅ Import initializes limits correctly
✅ Import preserves channels and anchors
✅ Anchor refresh displays imported content
✅ Custom Actions work after import (limits reset)
✅ Safari config complete after import

### Production Testing
- Tested: Pokevivor → CastBot Regression Pink
- Data: 2 stores, 7 items, 49 coordinates, 3 Custom Actions
- Result: All features working correctly

---

## Related Documentation

- [Safari System](./Safari.md) - Main Safari documentation
- [Safari Map System](./SafariMapSystem.md) - Map creation and management
- [Safari Custom Actions](./Challenges.md) - Custom Actions framework
- Implementation History:
  - [SafariImportMapIDMismatch.md](../implementation/SafariImportMapIDMismatch.md) - Ghost map bug analysis
  - [SafariCustomActionsImportExport.md](../implementation/SafariCustomActionsImportExport.md) - Original design doc
  - [SafariCustomActionsImportExport_GapsAnalysis.md](../implementation/SafariCustomActionsImportExport_GapsAnalysis.md) - Gaps analysis

---

## Future Enhancements (Out of Scope)

### Role ID Mapping
Allow users to map role IDs between servers for Custom Actions that reference roles.

### Selective Import
UI to choose which Custom Actions to import (checkbox list).

### Conflict Resolution Strategy
Let users choose merge behavior (always update, skip existing, create duplicate).

### Import Preview
Show diff before importing (what will change).

---

## Success Metrics

✅ Full Safari export includes all data types
✅ Import creates working Safari in new server
✅ Import merges correctly into existing server
✅ Custom Action limits reset properly
✅ Complete Safari config transfers
✅ No ghost maps created
✅ Audit trail available in #map-storage
✅ User workflow is clear and reliable

---

**Document Status:** Complete - All planned features implemented and deployed to production
