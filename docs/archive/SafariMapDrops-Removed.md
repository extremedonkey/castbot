> # 🪦 REMOVED — 2026-08-02
>
> **Map Drops (item drops / currency drops) no longer exists.** The feature was superseded by
> **Quick Items / Quick Currency** actions; its authoring UI had already been made unreachable
> (the `map_cell` entity editor stopped offering an `items` field group), leaving ~2,200 lines of
> orphaned handlers plus a live render path. All of it was deleted on 2026-08-02:
>
> - `app.js` — Drop Management UI + every `map_*_drop_*` / `map_item_search_*` / `map_currency_*` handler
> - `entityManagementUI.js` — `createMapItemSelectionUI` / `createMapItemSelector`
> - `safariButtonHelper.js` — anchor-message drop buttons
> - `safariProgress.js` — drop reporting
> - `buttonHandlerFactory.js` — 30 BUTTON_REGISTRY entries
>
> At removal, prod held **5 drops across 2 guilds** (EpochORG S11, dormant ~6 weeks; and Safari Test).
> Orphaned `itemDrops` / `currencyDrops` data was deliberately LEFT in `safariContent.json` — nothing
> reads it, so deleting it would be risk without benefit.
>
> **Use Quick Items / Quick Currency actions instead.** Kept for historical reference only.
> See [RaP 0966](../01-RaP/0966_20251206_DropsFeature_TechDebt_Options.md).

# Safari Map Drops System

This document describes the Store, Item Drop, and Currency Drop systems for Safari Map locations.

## Overview

The Safari Map Drops system allows admins to attach stores, items, and currency to specific map locations. Players can then interact with these elements when they visit those locations.

## Features

### 1. Store Attachment

Attach existing Safari stores to map locations:
- Players can only access stores when physically at that location
- Multiple stores can be attached to a single location
- Store buttons appear as grey secondary buttons

**Admin Setup:**
1. Click "Location Actions" button at any map coordinate
2. Click "🏪 Add Store" button
3. Select one or more stores from the multi-select menu
4. Selected stores will appear as buttons in the location's anchor message

**Player Experience:**
- Grey store button appears with store name and emoji
- Clicking opens the store browse interface (ephemeral)
- Can only access if in the correct channel/location

### 2. Item Drops

Place items at locations that players can collect:
- **One per player**: Each player can collect once
- **One per season**: Only one player can collect (first come, first served)

**Admin Setup:**
1. Click "Location Actions" → "🧰 Add Item"
2. Select item from dropdown
3. Configure:
   - Button style (color)
   - Button text and emoji
   - Drop type (one per player/season)
4. Click "✅ Add Item" to save

**Player Experience:**
- Colored button appears with custom text
- Click to collect item (added to inventory)
- "One per player": Can't collect again
- "One per season": Button disables after first claim

### 3. Currency Drops

Place currency at locations that players can collect:
- Same "one per player" or "one per season" options
- Custom amounts configurable

**Admin Setup:**
1. Click "Location Actions" → "🧰 Add Item"
2. Click "Add Currency Drop"
3. Configure:
   - Currency amount
   - Button text and emoji
   - Drop type (one per player/season)
4. Settings persist and can be edited

**Player Experience:**
- Colored button appears with custom text
- Click to collect currency
- Shows balance after collection
- Same claim restrictions as item drops

## Technical Implementation

### Data Structure

Drops are stored in map coordinates:
```javascript
coordinates[coord] = {
  // Existing fields...
  stores: ['store_id1', 'store_id2'],
  itemDrops: [{
    itemId: 'iron_sword',
    buttonText: 'Open Treasure Chest!',
    buttonEmoji: '📦',
    buttonStyle: 2, // 1=Primary, 2=Secondary, 3=Success, 4=Danger
    dropType: 'once_per_player' | 'once_per_season',
    claimedBy: [] // Array of userIds or single userId
  }],
  currencyDrops: [{
    amount: 100,
    buttonText: 'Collect Coins!',
    buttonEmoji: '🪙',
    buttonStyle: 2,
    dropType: 'once_per_player' | 'once_per_season',
    claimedBy: [] // Array of userIds or single userId
  }]
}
```

### Button Organization

Buttons appear in anchor messages with 5-button-per-row limit:
1. Store buttons (grey)
2. Item drop buttons (configured style)
3. Currency drop buttons (configured style)
4. Safari buttons (existing system)

### Claim Tracking

- **once_per_player**: `claimedBy` is array of user IDs
- **once_per_season**: `claimedBy` is single user ID
- Exhausted "once per season" buttons show "(Taken)" and are disabled

### Admin Controls

- **Reset Claims**: Clear claim history for testing
- **Remove Drop**: Delete drop from location
- **Edit Settings**: Modify all drop properties
- **Live Updates**: Anchor messages update automatically

## Usage Examples

### Creating a Treasure Room
1. Set location title: "💎 Treasure Chamber"
2. Add currency drop: "💰 Collect 500 gold!" (once per season)
3. Add item drops: 
   - "📜 Ancient Scroll" (once per player)
   - "⚔️ Legendary Sword" (once per season)

### Setting Up a Marketplace
1. Attach multiple stores to central location
2. Add small currency drop as "daily bonus" (once per player)
3. Players visit to shop and collect bonus

### Hidden Secrets
1. Place rare items in hard-to-find locations
2. Use "once per season" for ultra-rare rewards
3. First explorer gets the prize!

## Best Practices

1. **Balance Distribution**: Don't overload locations with drops
2. **Clear Button Text**: Make purpose obvious to players
3. **Strategic Placement**: Reward exploration
4. **Test First**: Use reset buttons to test configurations
5. **Monitor Claims**: Check who has claimed what in data

## Troubleshooting

**"You can only access this store from its location!"**
- Player trying to access store button from wrong channel
- Store buttons only work in their assigned coordinate channel

**"You have already taken this item!"**
- Player already claimed a "once per player" drop
- Use reset button to allow re-claiming for testing

**Button not appearing**
- Check 5-button-per-row limit isn't exceeded
- Verify anchor message updated after configuration
- Check item/store/currency exists in Safari data

## Future Enhancements

Potential improvements:
- Timed drops (refresh daily/weekly)
- Conditional drops (require specific items)
- Drop probability/chance system
- Visual indicators for claimed drops
- Bulk drop management interface