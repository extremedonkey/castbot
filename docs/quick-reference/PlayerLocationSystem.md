# Player Location System - Quick Reference

## 🎯 Essential Knowledge

**ALWAYS use `playerLocationManager.js` for ANY location-related features**. Never access player location data directly.

## 🚀 Core Module: `playerLocationManager.js`

### Primary Functions

```javascript
// Get all players on map with live Discord data
const locations = await getAllPlayerLocations(guildId, true, client);
// Returns: Map<userId, locationData>

// Find players at specific coordinate  
const players = await getPlayersAtLocation(guildId, 'B3', client);
// Returns: Array of player objects

// Check if two players are together
const { sameLocation, coordinate } = await arePlayersAtSameLocation(guildId, user1, user2);

// Get full context for one player
const details = await getPlayerLocationDetails(guildId, userId, client);

// Find nearby players (distance 1 = adjacent)
const nearby = await getNearbyPlayers(guildId, userId, 1, client);

// Create visual map display
const mapDisplay = await createPlayerLocationMap(guildId, client, { showBlacklisted: true });
```

### 🔑 Critical Pattern
**Always pass `client` parameter** for real-time Discord member data (live usernames/avatars):
```javascript
// ✅ GOOD - Gets live data
await getAllPlayerLocations(guildId, true, client);

// ❌ AVOID - Uses fallback data
await getAllPlayerLocations(guildId, true);
```

## 🗺️ Visual Map System

### Current Implementation
- **Player Symbol**: `♟` (chess pawn) for any number of players
- **Blacklist Symbol**: `X` for restricted coordinates  
- **Empty Cell**: `·` (middle dot)

### Display Format
```
   A  B  C  D  E  F  G
 1  ·  ·  X  ·  ·  ·  ·
 2  ·  ♟  ·  ·  ·  ·  X
 3  ·  ·  ♟  ·  ·  ·  ·

Legend:
· = Empty cell
♟ = Player(s)
X = Blacklisted (restricted access)

Occupied Cells:
B2: PlayerName1
C3: PlayerName2, PlayerName3
E4: PlayerName4

Blacklisted Cells: A4, C1, G2
```

### Customization Options
```javascript
// Different blacklist symbol
createPlayerLocationMap(guildId, client, { blacklistSymbol: '🚫' });

// Hide blacklisted coordinates
createPlayerLocationMap(guildId, client, { showBlacklisted: false });
```

## 🚫 Blacklist System

### Location: Map Explorer Menu
- **Button**: "Blacklisted Coords" in Map Explorer (NOT Player Setup)
- **Function**: Restricts player movement to specific coordinates
- **Storage**: Uses `mapExplorer.js` functions (`getBlacklistedCoordinates`, `updateBlacklistedCoordinates`)

### Implementation
```javascript
// Get blacklisted coordinates
const { getBlacklistedCoordinates } = await import('./mapExplorer.js');
const blacklisted = await getBlacklistedCoordinates(guildId);

// Update blacklisted coordinates  
const { updateBlacklistedCoordinates } = await import('./mapExplorer.js');
await updateBlacklistedCoordinates(guildId, ['A1', 'B2', 'C3']);
```

### Movement Integration
- **Prevention**: `mapMovement.js` automatically prevents movement to blacklisted cells
- **Validation**: Built into `getValidMoves()` function
- **Display**: Blacklisted moves show as `disabled: true` in UI

## 🎮 UI Integration

### Map Explorer Menu Changes
**REMOVED**: "Start Exploring" button
**ADDED**: "Player Locations" button (shows visual map + player details)

### Button Handler Pattern
```javascript
// In app.js - MANDATORY ButtonHandlerFactory pattern
} else if (custom_id === 'map_player_locations') {
  return ButtonHandlerFactory.create({
    id: 'map_player_locations',
    requiresPermission: PermissionFlagsBits.ManageRoles,
    updateMessage: true,
    ephemeral: true,
    handler: async (context) => {
      const { getAllPlayerLocations, createPlayerLocationMap } = await import('./playerLocationManager.js');
      // ... implementation
    }
  })(req, res, client);
}
```

### Button Registry
```javascript
// In buttonHandlerFactory.js
'map_player_locations': {
  label: 'Player Locations',
  description: 'View all player locations on the map',
  emoji: '👥',
  style: 'Primary',
  category: 'safari_map_admin',
  requiresPermission: 'ManageRoles'
}
```

## 🔮 Future Feature Foundation

### Whisper System
```javascript
const { sameLocation } = await arePlayersAtSameLocation(guildId, senderId, recipientId);
if (sameLocation) {
  // Allow whisper
}
```

### Item/Currency Transfer
```javascript
const sendersLocation = await getPlayerLocationDetails(guildId, senderId, client);
const recipientsLocation = await getPlayerLocationDetails(guildId, recipientId, client);
if (sendersLocation.coordinate === recipientsLocation.coordinate) {
  // Allow transfer
}
```

### Battle System
```javascript
const playersHere = await getPlayersAtLocation(guildId, coordinate, client);
const opponents = playersHere.filter(p => p.userId !== attackerId);
// Show battle options
```

### Proximity Features
```javascript
const nearby = await getNearbyPlayers(guildId, userId, distance, client);
// Range-based interactions
```

## 📊 Data Structure

```javascript
// Player location object format
{
  userId: "391415444084490240",
  coordinate: "B3",
  lastMovement: "2025-01-20T15:30:00.000Z",
  exploredCount: 12,
  stamina: { current: 8, max: 10 },
  displayName: "PlayerName", // Live from Discord
  avatar: "https://cdn.discordapp.com/avatars/...", // Live from Discord
  channelId: "1234567890",
  currency: 150,
  items: 5,
  otherPlayersHere: [...] // Other players at same location
}
```

## ⚠️ Critical Rules

1. **MANDATORY**: Use PlayerLocationManager for ALL location features
2. **ALWAYS**: Pass client parameter for live Discord data
3. **NEVER**: Access player location data directly from storage
4. **BLACKLIST**: Players cannot move onto blacklisted coordinates
5. **UI**: Use ButtonHandlerFactory pattern for all buttons
6. **PERMISSIONS**: Location admin features require ManageRoles

## 🔧 Files Modified

- **NEW**: `playerLocationManager.js` - Core location API
- **NEW**: `docs/features/PlayerLocationManager.md` - Full documentation
- **UPDATED**: `app.js` - Player Locations button handlers, removed Start Exploring
- **UPDATED**: `buttonHandlerFactory.js` - Button registry entries
- **UPDATED**: `CLAUDE.md` - References and mandatory usage notes
- **UPDATED**: `mapMovement.js` - Integration with location manager (client params)

## 🎯 Decision Tree

- **Need all players?** → `getAllPlayerLocations()`
- **Need specific location players?** → `getPlayersAtLocation()`  
- **Need two-player check?** → `arePlayersAtSameLocation()`
- **Need player details?** → `getPlayerLocationDetails()`
- **Need visual display?** → `createPlayerLocationMap()`
- **Need nearby players?** → `getNearbyPlayers()`

**This system is the foundation for ALL location-based features. When in doubt, use PlayerLocationManager first.**