# Safari Reverse Blacklist Feature

## Overview

The Reverse Blacklist feature allows specific items to grant players access to normally blacklisted (restricted) coordinates on the Safari map. This creates strategic gameplay where items like boats, bridges, or keys can unlock previously inaccessible areas.

**Status**: ✅ **IMPLEMENTED** - Deployed to production October 2025. **Semantics changed to AND-across-items July 2026** (see Deployment History).

**Example Use Case**: Deep water cells (A1-G1) are blacklisted, but holding a "Large Boat" item allows navigation through these coordinates.

**🔑 AND Semantics (multi-key doors)**: A coordinate unlocks only when the player holds **every** item whose reverse blacklist lists it. One item listing a cell = classic single-key door. Two items listing the same cell = a door requiring **both** keys — holding just one leaves it locked, with no player-facing cue (identical to a plain blacklisted cell). Quantity remains binary (1 copy = 100 copies). Before July 2026 this was a union (any one item unlocked the cell); no way to express "all keys required" existed.

**Related Features**:
- [Map Blacklist Overlay](MapBlacklistOverlay.md) - Visual indicators for blacklisted/unlocked cells in Map Explorer

## Technical Design

### 1. Data Model Changes

#### Item Definition Enhancement (safariContent.json)
```javascript
{
  "guildId": {
    "items": {
      "large_boat": {
        "name": "Large Boat",
        "emoji": "⛵",
        "description": "Allows travel across deep water",
        "basePrice": 500,
        // NEW FIELD
        "reverseBlacklist": ["A1", "B1", "C1", "D1", "E1", "F1", "G1"],
        // FUTURE: "consumeOnReverseUse": false, // For consumable items on reverse blacklist use
        // ... other item properties
      }
    }
  }
}
```

### 2. UI Implementation

#### 2.1 Item Configuration Modal ✅ AS-BUILT

**Location**: Entity Management → Items → **Movement Group** (formerly Stamina)

**Implementation**: fieldEditors.js:293-309, entityManagementUI.js:555

The field was moved from the Properties group to the Movement group (renamed from Stamina) because:
- Properties uses select menus, not modals
- Movement modal supports text inputs
- Logical grouping with staminaBoost and consumable fields

**Modal Field** (fieldEditors.js:293-309):
```javascript
case 'stamina': // Button labeled "Movement"
    // Add reverse blacklist field for unlocking restricted coordinates
    components.push({
        type: 1, // ActionRow
        components: [{
            type: 4, // Text Input
            custom_id: 'reverseBlacklist',
            label: 'Reverse Blacklist Coordinates',
            style: 2, // Paragraph
            value: currentValues.reverseBlacklist ?
                (Array.isArray(currentValues.reverseBlacklist) ?
                    currentValues.reverseBlacklist.join(', ') :
                    currentValues.reverseBlacklist) : '',
            placeholder: 'Unlocks restricted cells (e.g., A1, B2, C3)',
            required: false,
            max_length: 1000
        }]
    });
```

**Field Group Configuration** (entityManagementUI.js:555):
```javascript
stamina: {
    label: 'Movement',
    emoji: '⚡',
    fields: ['staminaBoost', 'reverseBlacklist', 'consumable']
}
```

**Validation & Parsing**: Handled by editFramework.js parseSubmittedData() with coordinate format validation

#### 2.2 Item Display Enhancement ✅ AS-BUILT

**Implementation**: entityManagementUI.js:374-379

**Item Info Display** (shown in item configuration UI):
```javascript
// In createEntityDisplay function
if (entity.staminaBoost !== undefined && entity.staminaBoost !== null && entity.staminaBoost !== 0) {
    lines.push(`**Stamina Boost**: ${entity.staminaBoost}`);
}
if (entity.reverseBlacklist && entity.reverseBlacklist.length > 0) {
    lines.push(`**Reverse Blacklist**: ${entity.reverseBlacklist.join(', ')}`);
}
```

**Display Context**: Only shown in item management UI, not visible to players in stores or inventory views

### 3. Navigation System Modifications

#### 3.1 Movement Display Generation ✅ AS-BUILT

**Implementation**: mapMovement.js:415-453

**Green Button Logic** (mapMovement.js:434-453):
```javascript
// Check reverse blacklist coverage ONCE before creating buttons
const reverseBlacklistCoverage = await getPlayerReverseBlacklistCoverage(guildId, userId);

// Button creation with reverse blacklist check
if (move.blacklisted) {
    const isUnlocked = reverseBlacklistCoverage.includes(move.coordinate);
    console.log(`🚫 Blacklisted coordinate ${move.coordinate} - Unlocked by item: ${isUnlocked}`);

    if (isUnlocked) {
        // Green button for reverse blacklist unlock (same label, different color)
        return {
            type: 2,
            custom_id: move.customId,
            label: `${dirLabel} (${targetCoordinate})`, // SAME label as normal
            style: canMove ? 3 : 2, // Success (green) if can move, else Secondary (grey)
            disabled: !canMove
        };
    }

    // Standard blacklisted button (disabled, grey)
    return {
        type: 2,
        custom_id: `blacklisted_${dir}`,
        label: `🚫 ${dirLabel}`,
        style: 2, // Secondary (grey)
        disabled: true
    };
}
```

**Performance Notes**:
- Uses deferred response pattern in navigation handlers
- Single reverse blacklist coverage check per display generation
- Empty inventory fast-path optimization
- No deferred flag parameter needed (handled by ButtonHandlerFactory)

#### 3.2 Reverse Blacklist Coverage Function ✅ AS-BUILT (AND semantics, July 2026)

**Implementation**: mapMovement.js — `computeReverseBlacklistCoverage` (pure, exported, unit-tested in tests/mapMovement.test.js) + `getPlayerReverseBlacklistCoverage` (async wrapper that loads inventory/items)

**Critical Bug Fix**: Inventory structure is `{quantity, numAttacksAvailable}`, not direct numbers

```javascript
// Pure AND-semantics coverage. A coordinate unlocks only when the player holds EVERY
// item whose reverseBlacklist lists it (qty >= 1 each; quantity beyond 1 is ignored).
export function computeReverseBlacklistCoverage(inventory, items) {
    const heldItemIds = new Set();
    for (const [itemId, itemData] of Object.entries(inventory)) {
        // Handle both old format (direct number) and new format (object with quantity property)
        const quantity = typeof itemData === 'number' ? itemData : (itemData?.quantity || 0);
        if (quantity > 0) {
            heldItemIds.add(itemId);
        }
    }
    if (heldItemIds.size === 0) {
        return [];
    }

    // coordinate -> every itemId that lists it (ALL are required to unlock)
    const requiredByCoord = new Map();
    for (const [itemId, item] of Object.entries(items)) {
        if (Array.isArray(item?.reverseBlacklist)) {
            for (const coord of item.reverseBlacklist) {
                if (!requiredByCoord.has(coord)) {
                    requiredByCoord.set(coord, []);
                }
                requiredByCoord.get(coord).push(itemId);
            }
        }
    }

    const unlockedCoordinates = [];
    for (const [coord, requiredIds] of requiredByCoord) {
        if (requiredIds.every(id => heldItemIds.has(id))) {
            unlockedCoordinates.push(coord);
        } else if (requiredIds.some(id => heldItemIds.has(id))) {
            const missing = requiredIds.filter(id => !heldItemIds.has(id));
            console.log(`🔒 ${coord} stays locked: requires ALL of [${requiredIds.join(', ')}], missing [${missing.join(', ')}]`);
        }
    }
    return unlockedCoordinates;
}

export async function getPlayerReverseBlacklistCoverage(guildId, userId) {
    const { loadPlayerData } = await import('./storage.js');
    const playerData = await loadPlayerData();
    const inventory = playerData[guildId]?.players?.[userId]?.safari?.inventory || {};

    // Fast-path: Empty inventory = no unlocks
    if (Object.keys(inventory).length === 0) {
        return [];
    }

    const { loadSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    const items = safariData[guildId]?.items || {};

    return computeReverseBlacklistCoverage(inventory, items);
}
```

**Key Implementation Details**:
- **AND across items**: iterates the guild's item *definitions* (not just the inventory) to build the per-coordinate required set, then unlocks only fully-held coordinates
- **Inventory Structure Fix**: Handles `{quantity: 10, numAttacksAvailable: 0}` format
- **Fast-path**: Returns immediately if inventory is empty (performance optimization)
- **Quantity Check**: Binary — items with quantity > 0 count as held; extra copies are irrelevant
- **Partial-hold logging**: cells locked because some-but-not-all required items are held log a `🔒` line naming the missing items (host debugging aid — players see nothing)

#### 3.3 Movement Validation ✅ AS-BUILT

**Implementation**: mapMovement.js:204-216

**Server-Side Validation** (mapMovement.js:204-216):
```javascript
// Check if target is blacklisted
const targetMove = validMoves.find(move => move.coordinate === newCoordinate);
if (targetMove?.blacklisted) {
    // Check for reverse blacklist unlock
    const reverseBlacklistCoverage = await getPlayerReverseBlacklistCoverage(guildId, userId);

    if (!reverseBlacklistCoverage.includes(newCoordinate)) {
        return {
            success: false,
            message: `⛔ You cannot access that location. It has been restricted.`
        };
    }

    // Player has item that unlocks this coordinate
    console.log(`✅ Player ${userId} using reverse blacklist to access ${newCoordinate}`);
}
```

**Security Notes**:
- **Always validates server-side** - Never trusts client button states
- **Re-checks inventory** - Guards against item removal during navigation
- **Audit logging** - Logs when reverse blacklist is used

### 4. Button Handler Updates ✅ AS-BUILT

#### 4.1 Navigate Button Handlers

**Implementation**: app.js:4356, app.js:4376

**Deferred Response Pattern** (app.js:4376):
```javascript
// safari_navigate_{userId}_{coordinate} handler
return ButtonHandlerFactory.create({
    id: `safari_navigate_${userId}_${coordinate}`,
    ephemeral: true,
    deferred: true, // Uses deferred response due to inventory checks
    handler: async (context) => {
        const { getMovementDisplay } = await import('./mapMovement.js');

        // Get movement display with expensive inventory checks
        return await getMovementDisplay(
            context.guildId,
            context.userId,
            coordinate
        );
    }
})(req, res, client);
```

**Key Changes**:
- Added `deferred: true` to ButtonHandlerFactory configuration
- ButtonHandlerFactory automatically handles deferred response pattern
- No manual token storage required (handled by framework)

### 5. Map Display Enhancement ✅ AS-BUILT

#### 5.1 Player Location Map Admin Display

**Implementation**: playerLocationManager.js:379-420

**Reverse Blacklist Info Display** (playerLocationManager.js:379-408):
```javascript
// After blacklisted cells display in createPlayerLocationMap()
if (showBlacklisted && blacklistedWithInfo.length > 0) {
    legend += `\n**Blacklisted Cells:** ${blacklistedWithInfo.join(', ')}\n`;

    // Show reverse blacklist coverage
    const reverseBlacklistInfo = await getReverseBlacklistItemSummary(guildId);
    if (reverseBlacklistInfo.length > 0) {
        legend += `\n**Reverse Blacklist Items:**\n`;
        reverseBlacklistInfo.forEach(info => {
            legend += `• ${info.emoji} ${info.name}: ${info.coordinates.join(', ')}\n`;
        });
    }
}
```

**Helper Function** (playerLocationManager.js:396-420) - **Now Exported**:
```javascript
async function getReverseBlacklistItemSummary(guildId) {
    const { loadSafariContent } = await import('./safariManager.js');
    const safariData = await loadSafariContent();
    const items = safariData[guildId]?.items || {};

    return Object.entries(items)
        .filter(([id, item]) => item.reverseBlacklist?.length > 0)
        .map(([id, item]) => ({
            name: item.name,
            emoji: item.emoji || '📦',
            coordinates: item.reverseBlacklist
        }));
}

// Exported for use in map overlay generation (MapBlacklistOverlay feature)
export { getReverseBlacklistItemSummary };
```

**Display Context**: Only visible in Map Admin → Player Locations view (admin-only)

## Implementation Checklist ✅ COMPLETED

### Phase 1: Data Model ✅
- [x] Add `reverseBlacklist` field to item schema in editFramework.js
- [x] Update item creation/editing in entityManagementUI.js
- [x] Add field to Movement modal group (fieldEditors.js)

### Phase 2: Navigation Display ✅
- [x] Modify `getMovementDisplay()` to check reverse blacklist
- [x] Add `getPlayerReverseBlacklistCoverage()` function
- [x] Update button creation logic for green unlock buttons
- [x] Convert to deferred response pattern (ButtonHandlerFactory)
- [x] **FIX**: Handle inventory structure `{quantity, numAttacksAvailable}`

### Phase 3: Movement Validation ✅
- [x] Update `movePlayer()` to validate reverse blacklist
- [x] Add appropriate logging for reverse blacklist usage
- [x] Test edge cases (item removed mid-movement)

### Phase 4: Map Admin Display ✅
- [x] Add reverse blacklist info to player location map (admin only)
- [x] Show reverse blacklist coordinates in item configuration UI
- [x] Test visual feedback (green buttons in navigation)
- [x] **EXTRA**: Export `getReverseBlacklistItemSummary()` for Map Overlay feature

### Phase 5: Map Overlay Integration ✅ (Bonus Feature)
- [x] Integrate with Map Blacklist Overlay feature (see MapBlacklistOverlay.md)
- [x] Visual green overlays on unlocked cells in Map Explorer
- [x] Dynamic legend showing blacklist/reverse blacklist status

## Performance Considerations

### Deferred Response Strategy
```javascript
// All navigation handlers should follow this pattern:
if (custom_id.startsWith('safari_navigate')) {
    // 1. Send deferred response immediately
    await res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: { flags: InteractionResponseFlags.EPHEMERAL }
    });

    // 2. Do expensive operations
    const display = await getMovementDisplay(guildId, userId, coordinate, true);

    // 3. Edit original response via webhook
    await DiscordRequest(`webhooks/${appId}/${token}/messages/@original`, {
        method: 'PATCH',
        body: display
    });
}
```

### Caching Strategy
Consider caching reverse blacklist coverage per player:
- Cache for duration of navigation interaction
- Clear on inventory changes
- Reduces repeated inventory scans

## Edge Cases & Validation

1. **Item Quantity Zero**: Ensure items with quantity 0 don't grant access
2. **Invalid Coordinates**: Validate coordinate format during item configuration
3. **Item Removal During Navigation**: Re-validate on actual movement
4. **Multiple Items Same Coordinate**: ALL listing items required (AND) — this is the multi-key door mechanic, not an either-or
5. **Performance with Large Inventories**: Use Set for O(1) lookups

## Security Considerations

1. **Server-side Validation**: Always validate reverse blacklist on server
2. **No Client Trust**: Don't trust button states from client
3. **Audit Logging**: Log when reverse blacklist is used for movement
4. **Permission Checks**: Ensure proper admin permissions for configuration

## Future Enhancements

1. **Conditional Unlocks**: Items unlock coordinates only under certain conditions
2. **Temporary Unlocks**: Time-limited access to coordinates
3. **Item Consumption**: Option to consume item on use
4. **Visual Indicators**: Show unlock items required on blacklisted cells
5. **Achievement Integration**: Track usage of reverse blacklist items

## Implementation Decisions

0. **AND Across Items (July 2026)**: A cell listed on multiple items requires ALL of them held. Originally a union (any one item unlocked); flipped because hosts intuitively expect "both keys on this door = both keys required", and the union made multi-key doors impossible while AND still expresses single-key doors unchanged. At flip time no production guild had overlapping coordinates across items, so no live safari changed behavior. Locked-but-partially-held cells deliberately show NO player-facing cue (same grey 🚫 button as any blacklisted cell); Map Explorer's admin legend marks multi-key cells with ²
1. **Item Stack Behavior**: Binary check - having 1 or 100 of an item provides the same unlock
2. **Visual Feedback**: Green button color only, no label changes
3. **UI Display**: Reverse blacklist info only shown in map admin and item configuration
4. **Performance**: Fast-path optimization for empty inventories
5. **Cache Duration**: Per-interaction lifecycle with automatic disposal
6. **Future Enhancement**: `consumeOnReverseUse` field provision for consumable unlocks

## Deployment History

### Production Deployment
- **Date**: October 2025
- **Status**: ✅ Live in production
- **Total Implementation Time**: ~3 hours (as estimated)
- **Technical Debt**: Minimal - followed lean implementation principles

### Key Deployment Notes
1. **Backwards Compatibility**: Handles both old (direct number) and new (object) inventory formats
2. **Performance**: Fast-path optimization for empty inventories
3. **Security**: Server-side validation prevents client-side manipulation
4. **Integration**: Seamlessly integrated with Map Blacklist Overlay feature

### Semantics Change: Union → AND (2026-07-28)
- **What**: A coordinate now unlocks only when the player holds EVERY item listing it (was: any one item)
- **Why**: Multi-key doors ("needs Red Key AND Blue Key") were impossible; hosts assumed AND
- **Migration risk**: None found — audited all production guilds at flip time; no coordinate appeared on more than one item's reverse blacklist
- **Code**: `computeReverseBlacklistCoverage` extracted as a pure exported function in mapMovement.js, unit-tested in tests/mapMovement.test.js
- **Admin UI**: Map Explorer legend marks multi-key cells with ² ("On multiple items — players need ALL of them to enter")

### Known Issues
None reported as of production deployment.

### Future Enhancements (Not Implemented)
1. **Conditional Unlocks**: Items unlock coordinates only under certain conditions
2. **Temporary Unlocks**: Time-limited access to coordinates
3. **Item Consumption**: `consumeOnReverseUse` field for consumable unlocks
4. **Visual Indicators**: Show required unlock items on blacklisted cells (player-facing)
5. **Achievement Integration**: Track usage of reverse blacklist items

---

**Document Version**: 2.0 (As-Built)
**Last Updated**: October 2025
**Implementation Status**: ✅ Complete & Deployed