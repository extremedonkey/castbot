# Player Location Manager

## Overview

The **PlayerLocationManager** (`playerLocationManager.js`) is a centralized system for managing and querying player locations on the Safari Map. It provides a comprehensive API for all location-based features and serves as the foundation for player interactions, monitoring, and proximity-based functionality.

## 🎯 Primary Use Cases

When working on ANY feature that involves player locations, interactions, or proximity, **ALWAYS** use the PlayerLocationManager module instead of direct data access.

### Required Features (Current & Future)
- ✅ **Production team monitoring** - Where all players are located
- ✅ **Player proximity detection** - Who's in same location/nearby
- 🔄 **Whisper systems** - Private messages between players in same location
- 🔄 **Item transfers** - Only allow between players at same coordinate
- 🔄 **Currency/gold transfers** - Location-restricted trading
- 🔄 **Battle systems** - Combat between players in same area
- 🔄 **Social features** - See other players in your location

## 🚨 Critical Implementation Note

**All functions now support real-time Discord member fetching** - The module has been enhanced to fetch live Discord member data when a `client` parameter is provided. This ensures accurate display names and avatars.

## 📚 Core Functions

### 1. `getAllPlayerLocations(guildId, includeOffline = true, client = null)`
**Primary function for getting all players on the map**

```javascript
// Get all players with live Discord data
const locations = await getAllPlayerLocations(guildId, true, client);
// Returns: Map<userId, locationData>
```

**When to use**: 
- Production team wants to see where everyone is
- Building overview displays
- Checking total player activity

### 2. `getPlayersAtLocation(guildId, coordinate, client = null)`
**Get all players at a specific coordinate**

```javascript
// Find who's at coordinate B3
const playersAtB3 = await getPlayersAtLocation(guildId, 'B3', client);
// Returns: Array of player objects
```

**When to use**:
- Whisper systems (find who can receive messages)
- Item/currency transfers (validate same location)
- Battle systems (find potential opponents)
- Social features (show "Players Here" lists)

### 3. `arePlayersAtSameLocation(guildId, userId1, userId2)`
**Quick check if two specific players are together**

```javascript
const { sameLocation, coordinate } = await arePlayersAtSameLocation(guildId, user1, user2);
if (sameLocation) {
    // Allow interaction at coordinate
}
```

**When to use**:
- Validating transfers between specific players
- Battle challenges
- Direct player interactions

### 4. `getPlayerLocationDetails(guildId, userId, client = null)`
**Comprehensive info about a specific player's location**

```javascript
const details = await getPlayerLocationDetails(guildId, userId, client);
// Returns: Full location context including other players, items, currency
```

**When to use**:
- Player profile displays
- Detailed location context
- Admin player management

### 5. `getNearbyPlayers(guildId, userId, distance = 1, client = null)`
**Find players within a certain distance**

```javascript
// Find players within 1 cell (adjacent)
const nearby = await getNearbyPlayers(guildId, userId, 1, client);
```

**When to use**:
- Extended interaction ranges
- Area-of-effect abilities
- Proximity-based features

### 6. `createPlayerLocationMap(guildId, client = null)`
**Visual ASCII grid showing all player positions**

```javascript
const mapDisplay = await createPlayerLocationMap(guildId, client);
// Returns: Components V2 formatted visual map
```

**When to use**:
- Admin overview displays
- Production team monitoring
- Map status interfaces

## 🔧 Integration Examples

### For Whisper Systems
```javascript
// Check if players can whisper (same location)
const { sameLocation, coordinate } = await arePlayersAtSameLocation(guildId, senderId, recipientId);
if (sameLocation) {
    // Send whisper message
    console.log(`Players can whisper at ${coordinate}`);
}
```

### For Item Transfers
```javascript
// Validate transfer between players
const sendersLocation = await getPlayerLocationDetails(guildId, senderId, client);
const recipientsLocation = await getPlayerLocationDetails(guildId, recipientId, client);

if (sendersLocation.coordinate === recipientsLocation.coordinate) {
    // Allow item transfer
    transferItem(senderId, recipientId, itemId);
}
```

### For Battle Systems
```javascript
// Find potential battle opponents
const playersHere = await getPlayersAtLocation(guildId, coordinate, client);
const opponents = playersHere.filter(p => p.userId !== attackerId);
// Show battle options
```

### For Social Features
```javascript
// Show "Players in this location" 
const details = await getPlayerLocationDetails(guildId, userId, client);
const otherPlayers = details.otherPlayersHere;
// Display social interface with other players
```

## 📊 Data Structure

Each player location object contains:
```javascript
{
    userId: "391415444084490240",
    coordinate: "B3",
    lastMovement: "2025-01-20T15:30:00.000Z",
    exploredCount: 12,
    stamina: { current: 8, max: 10 },
    displayName: "PlayerName", // Live from Discord
    avatar: "https://cdn.discordapp.com/avatars/...", // Live from Discord
    channelId: "1234567890", // Associated Discord channel
    currency: 150,
    items: 5, // Item count
    otherPlayersHere: [...] // Other players at same location
}
```

## 🚨 Best Practices

### 1. Always Pass Client When Available
```javascript
// ✅ GOOD - Gets live Discord data
const locations = await getAllPlayerLocations(guildId, true, client);

// ❌ AVOID - Uses cached/fallback data
const locations = await getAllPlayerLocations(guildId, true);
```

### 2. Use Appropriate Function for Task
```javascript
// ✅ For checking two specific players
const result = await arePlayersAtSameLocation(guildId, user1, user2);

// ❌ Overkill for simple check
const allLocations = await getAllPlayerLocations(guildId);
// ...manually compare positions
```

### 3. Cache Results for UI Updates
```javascript
// ✅ Store for multiple operations
const playerLocations = await getAllPlayerLocations(guildId, true, client);
const playersAtA1 = Array.from(playerLocations.values()).filter(p => p.coordinate === 'A1');
const playersAtB2 = Array.from(playerLocations.values()).filter(p => p.coordinate === 'B2');
```

## 🔗 Connected Systems

### Current Integrations
- **Map Explorer UI** - Uses `createPlayerLocationMap()` and `getAllPlayerLocations()`
- **Movement System** - Updates location data that this module reads
- **Stamina System** - Integrated via `getEntityPoints()`

### Future Integration Points
- **Whisper Commands** - Will use `arePlayersAtSameLocation()`
- **Trade Systems** - Will use `getPlayersAtLocation()`
- **Battle Systems** - Will use `getNearbyPlayers()`
- **Social Features** - Will use `getPlayerLocationDetails()`

## ⚠️ Important Notes

1. **Real-time Updates**: The module now fetches live Discord member data when `client` is provided
2. **Performance**: Uses efficient caching and batch operations
3. **Logging**: Comprehensive debug logging for troubleshooting
4. **Error Handling**: Graceful fallbacks when Discord data unavailable
5. **Future-Proof**: Designed to support all planned location-based features

## 🎯 Usage Decision Tree

**Need to find specific players?** → Use `getPlayersAtLocation()` or `arePlayersAtSameLocation()`

**Need overview of all players?** → Use `getAllPlayerLocations()` or `createPlayerLocationMap()`

**Need detailed context for one player?** → Use `getPlayerLocationDetails()`

**Need players within range?** → Use `getNearbyPlayers()`

**Building admin interfaces?** → Use `createPlayerLocationMap()` + `formatPlayerLocationDisplay()`

---

*This module is the foundation for ALL location-based features. When in doubt, check here first before implementing location-related functionality.*