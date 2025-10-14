# Safari Reverse Blacklist Feature Design

## Overview

The Reverse Blacklist feature allows specific items to grant players access to normally blacklisted (restricted) coordinates on the Safari map. This creates strategic gameplay where items like boats, bridges, or keys can unlock previously inaccessible areas.

**Example Use Case**: Deep water cells (A1-G1) are blacklisted, but holding a "Large Boat" item allows navigation through these coordinates.

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

#### 2.1 Item Configuration Modal

**Location**: Entity Management → Items → Persistence Group

**Modal Field Addition** (entityManagementUI.js):
```javascript
// In entity_field_group_item_{itemId}_properties modal
{
  type: 1, // Action Row
  components: [{
    type: 4, // Text Input
    custom_id: 'reverseBlacklist',
    label: 'Reverse Blacklist Coordinates',
    style: 2, // Paragraph
    placeholder: 'Enter comma-separated coordinates (e.g., A1, B3, C5)',
    value: item.reverseBlacklist?.join(', ') || '',
    required: false,
    max_length: 1000
  }]
}
```

**Validation & Parsing** (similar to map_admin_blacklist_modal):
```javascript
const reverseBlacklistInput = components.find(c => c.custom_id === 'reverseBlacklist')?.value || '';
const reverseBlacklist = reverseBlacklistInput
  .split(',')
  .map(coord => coord.trim().toUpperCase())
  .filter(coord => coord.match(/^[A-Z]\d+$/)); // Validate format
```

#### 2.2 Item Display Enhancement

**Text Display Update** (entity_select_item view):
```javascript
// ONLY show in item configuration UI, not regular item displays
// This info appears when editing items, not when viewing them in stores/inventory
if (context === 'item_config' && item.reverseBlacklist && item.reverseBlacklist.length > 0) {
  content += `\n🔓 **Reverse Blacklist**: ${item.reverseBlacklist.join(', ')}`;
}
```

### 3. Navigation System Modifications

#### 3.1 Movement Display Generation (mapMovement.js:391)

**CRITICAL PERFORMANCE CONSIDERATION**: Use deferred response pattern

```javascript
export async function getMovementDisplay(guildId, userId, coordinate, isDeferred = false) {
    // For non-deferred calls, return deferred response first
    if (!isDeferred) {
        return {
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
            data: { flags: InteractionResponseFlags.EPHEMERAL }
        };
    }

    // Expensive operations below...
    const canMove = await canPlayerMove(guildId, userId);
    const validMoves = await getValidMoves(coordinate, 'adjacent_8', guildId);

    // NEW: Get player's reverse blacklist coverage
    const reverseBlacklistCoverage = await getPlayerReverseBlacklistCoverage(guildId, userId);

    // Modified button creation logic
    const createButton = (dir, dirLabel, targetCol, targetRow) => {
        const move = movesByDirection[dir];

        if (move?.blacklisted) {
            // Check if player has item that unlocks this coordinate
            const isUnlocked = reverseBlacklistCoverage.includes(move.coordinate);

            if (isUnlocked) {
                // Green button for reverse blacklist unlock (same label, different color)
                return {
                    type: 2,
                    custom_id: move.customId,
                    label: `${dirLabel} (${targetCoordinate})`, // Same as normal
                    style: 3, // Success (green) instead of Primary (blue)
                    disabled: !canMove
                };
            } else {
                // Standard blacklisted button (disabled)
                return {
                    type: 2,
                    custom_id: `blacklisted_${dir}`,
                    label: `🚫 ${dirLabel}`,
                    style: 2, // Secondary
                    disabled: true
                };
            }
        }

        // Normal movement button (unchanged)
        return {
            type: 2,
            custom_id: move.customId,
            label: `${dirLabel} (${targetCoordinate})`,
            style: canMove ? 1 : 2, // Primary if can move
            disabled: !canMove
        };
    };
}
```

#### 3.2 Reverse Blacklist Coverage Function

```javascript
// New function in mapMovement.js
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

    const unlockedCoordinates = new Set();

    // Check each inventory item for reverse blacklist
    for (const [itemId, quantity] of Object.entries(inventory)) {
        if (quantity > 0) {
            const item = items[itemId];
            if (item?.reverseBlacklist) {
                item.reverseBlacklist.forEach(coord => unlockedCoordinates.add(coord));
            }
        }
    }

    return Array.from(unlockedCoordinates);
}
```

#### 3.3 Movement Validation (mapMovement.js:movePlayer)

```javascript
export async function movePlayer(guildId, userId, newCoordinate, client = null) {
    // ... existing validation ...

    // Check if target is blacklisted
    const targetMove = validMoves.find(move => move.coordinate === newCoordinate);
    if (targetMove?.blacklisted) {
        // NEW: Check for reverse blacklist unlock
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

    // ... continue with movement ...
}
```

### 4. Button Handler Updates

#### 4.1 Navigate Button Handlers (app.js)

```javascript
// safari_navigate_{userId}_{coordinate} handler
ButtonHandlerFactory.create({
    id: `safari_navigate_${userId}_${coordinate}`,
    ephemeral: true,
    deferred: true, // CHANGED: Now deferred due to inventory checks
    handler: async (context) => {
        const { getMovementDisplay } = await import('./mapMovement.js');

        // Get movement display with expensive inventory checks
        const movementDisplay = await getMovementDisplay(
            context.guildId,
            context.userId,
            coordinate,
            true // isDeferred flag
        );

        // Store interaction token for later editing
        if (!global.navigationInteractions) {
            global.navigationInteractions = new Map();
        }
        global.navigationInteractions.set(`${context.userId}_${coordinate}`, {
            token: req.body.token,
            appId: appId
        });

        return movementDisplay;
    }
})
```

### 5. Map Display Enhancement

#### 5.1 Player Location Map (playerLocationManager.js)

```javascript
export async function createPlayerLocationMap(guildId, client = null, options = {}) {
    // ... existing code ...

    // After blacklisted cells display
    if (showBlacklisted && blacklistedCoords.length > 0) {
        legend += `\n**Blacklisted Cells:** ${blacklistedWithInfo.join(', ')}\n`;

        // NEW: Show reverse blacklist coverage
        const reverseBlacklistInfo = await getReverseBlacklistItemSummary(guildId);
        if (reverseBlacklistInfo.length > 0) {
            legend += `\n**Reverse Blacklist Items:**\n`;
            reverseBlacklistInfo.forEach(info => {
                legend += `• ${info.emoji} ${info.name}: ${info.coordinates.join(', ')}\n`;
            });
        }
    }

    return { /* container structure */ };
}

// New helper function
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
```

## Implementation Checklist

### Phase 1: Data Model (30 min)
- [ ] Add `reverseBlacklist` field to item schema in editFramework.js
- [ ] Update item creation/editing in entityManagementUI.js
- [ ] Add field to properties modal group

### Phase 2: Navigation Display (1 hour)
- [ ] Modify `getMovementDisplay()` to check reverse blacklist
- [ ] Add `getPlayerReverseBlacklistCoverage()` function
- [ ] Update button creation logic for green unlock buttons
- [ ] Convert to deferred response pattern

### Phase 3: Movement Validation (30 min)
- [ ] Update `movePlayer()` to validate reverse blacklist
- [ ] Add appropriate logging for reverse blacklist usage
- [ ] Test edge cases (item removed mid-movement)

### Phase 4: Map Admin Display (30 min)
- [ ] Add reverse blacklist info to player location map (admin only)
- [ ] Show reverse blacklist coordinates in item configuration UI
- [ ] Test visual feedback (green buttons in navigation)

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
4. **Multiple Items Same Coordinate**: Union of all unlocked coordinates
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

1. **Item Stack Behavior**: Binary check - having 1 or 100 of an item provides the same unlock
2. **Visual Feedback**: Green button color only, no label changes
3. **UI Display**: Reverse blacklist info only shown in map admin and item configuration
4. **Performance**: Fast-path optimization for empty inventories
5. **Cache Duration**: Per-interaction lifecycle with automatic disposal
6. **Future Enhancement**: `consumeOnReverseUse` field provision for consumable unlocks

## Recommended Implementation Order

1. **Start with data model** - Add field, no functionality
2. **Add UI for configuration** - Test data persistence
3. **Implement display logic** - See green buttons
4. **Add movement validation** - Ensure security
5. **Polish and optimize** - Add deferred patterns

This lean implementation should take approximately 2-3 hours with minimal technical debt.