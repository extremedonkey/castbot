# Safari Map Movement System Documentation

## Overview

The Safari Map Movement System enables players to explore grid-based maps with stamina-limited movement and Discord channel-based location representation. Players physically "move" between Discord channels representing map coordinates, creating an immersive exploration experience.

## Table of Contents

1. [Core Features](#core-features)
2. [Movement Mechanics](#movement-mechanics)
3. [Permission System](#permission-system)
4. [Player Experience](#player-experience)
5. [Technical Implementation](#technical-implementation)
6. [Admin Controls](#admin-controls)
7. [Integration with Points System](#integration-with-points-system)
8. [Movement Schemas](#movement-schemas)
9. [Future Enhancements](#future-enhancements)

## Core Features

### Grid-Based Movement
- Players occupy specific grid coordinates (A1, B3, D5, etc.)
- Movement limited to adjacent cells based on movement schema
- Each coordinate corresponds to a Discord channel

### Stamina System
- Movement costs stamina points (default: 1 per move)
- Stamina regenerates over time (default: full reset every 12 hours)
- Creates strategic movement decisions

### Discord Integration
- Each map coordinate has its own Discord channel (#a1, #b2, etc.)
- Players can only see/interact with their current location
- Automatic permission management on movement

## Movement Mechanics

### Valid Moves

The default movement schema allows 8-directional movement:

```
Current Position: C3

Valid Moves:
B2 (↖️ Northwest)  B3 (⬆️ North)   B4 (↗️ Northeast)
C2 (⬅️ West)       C3 (current)    C4 (➡️ East)
D2 (↙️ Southwest)  D3 (⬇️ South)   D4 (↘️ Southeast)
```

### Movement Process

1. **Player clicks movement button** → `safari_move_B3`
2. **System checks stamina** → Must have at least 1 point
3. **Validates move** → Target must be adjacent
4. **Updates permissions** → Remove old channel, add new channel
5. **Deducts stamina** → Uses 1 point
6. **Updates location** → Records new position

## Permission System

### Channel Visibility
- **Current Location**: VIEW_CHANNEL + SEND_MESSAGES
- **Previous Locations**: No permissions (complete blackout)
- **Unexplored Areas**: No permissions

### Permission Updates
```javascript
// On movement from A1 to B1
Remove permissions: #a1 channel
Add permissions: #b1 channel
```

### Security
- Server-side validation of all movements
- Permission checks before granting access
- Rate limiting on movement commands

## Player Experience

### Starting the Adventure

1. **Initialize on Map**
   - Click "Start Exploring" in Map Explorer menu
   - Placed at starting position (default: A1)
   - Receives full stamina

2. **Movement Interface**
   ```
   🗺️ Current Location: A1
   
   Choose a direction to move:
   [⬆️ North (A2)] [➡️ East (B1)] [⬇️ South] [⬅️ West]
   
   *You can move once every 12 hours*
   ```

3. **Moving Between Locations**
   - Click directional button
   - See "You move to B1!" message
   - New channel becomes visible
   - Movement buttons update for new location

### Stamina Management

**With Stamina:**
- Buttons are blue and clickable
- Can move to any adjacent cell

**Without Stamina:**
- Buttons are gray and disabled
- Shows "Rest for 7h 23m" message
- Must wait for regeneration

## Technical Implementation

### Data Storage

**Player Location (playerData.json):**
```json
{
  "safari": {
    "mapState": {
      "currentCoordinate": "C3",
      "currentMapId": "map_5x5_1704236400000",
      "lastMovement": 1704236400000,
      "visitedCoordinates": ["A1", "B1", "C2", "C3"]
    }
  }
}
```

**Stamina Points (safariContent.json):**
```json
{
  "entityPoints": {
    "player_391415444084490240": {
      "stamina": {
        "current": 7,
        "max": 10,
        "lastRegeneration": 1704236400000,
        "lastUse": 1704236400000
      }
    }
  }
}
```

### Core Functions

#### Movement Validation
```javascript
getValidMoves(currentCoordinate, movementSchema)
// Returns array of valid destination coordinates
```

#### Execute Movement
```javascript
movePlayer(guildId, userId, newCoordinate, client)
// Handles complete movement process
```

#### Permission Management
```javascript
updateChannelPermissions(guildId, userId, oldCoord, newCoord, client)
// Updates Discord channel permissions
```

## Admin Controls

### Initialize Player
```javascript
await initializePlayerOnMap(guildId, userId, 'A1', client);
```
- Sets starting position
- Grants initial stamina
- Opens first channel

### Set Player Location
```javascript
await setPlayerLocation(guildId, userId, 'D5');
```
- Forcibly moves player
- Updates permissions
- No stamina cost

### Adjust Stamina
```javascript
await setEntityPoints(guildId, `player_${userId}`, 'stamina', 10);
```
- Set current stamina
- Bypass regeneration timing

## Integration with Points System

### Movement Cost Configuration
```json
{
  "pointsConfig": {
    "movementCost": {
      "stamina": 1  // Points per movement
    }
  }
}
```

### Custom Movement Actions
Safari buttons can use movement actions:
```json
{
  "type": "move_player",
  "config": {
    "coordinate": "B3"
  }
}
```

### Movement Conditions
Check if player can move:
```json
{
  "type": "can_move"
}
```

Check player location:
```json
{
  "type": "at_location",
  "coordinate": "C3"
}
```

## Movement Schemas

### Current Implementation (MVP)
**adjacent_8**: Move to any of 8 adjacent cells
- North, South, East, West
- Northeast, Northwest, Southeast, Southwest
- Standard for most maps

### Future Schemas

**cardinal_4**: Only cardinal directions
- North, South, East, West
- No diagonal movement

**teleport**: Non-adjacent movement
- Warp points between areas
- Portal connections

**terrain_based**: Variable by cell type
- Roads allow 2-cell movement
- Mountains block certain directions
- Water requires special items

## Future Enhancements

### Advanced Movement Features

1. **Terrain Effects**
   - Different stamina costs per terrain
   - Movement speed modifiers
   - Terrain-specific restrictions

2. **Group Movement**
   - Party system for coordinated exploration
   - Shared vision of adjacent cells
   - Leader-follower mechanics

3. **Fast Travel**
   - Unlock waypoints at key locations
   - Stamina-free travel between waypoints
   - Discovery rewards

4. **Movement Items**
   - Boots: Reduced stamina cost
   - Mount: Move 2 cells at once
   - Teleport scrolls: One-time warps

### Visual Enhancements

1. **Mini-Map Display**
   - Show explored areas
   - Current position indicator
   - Fog of war for unexplored

2. **Movement Animations**
   - Transition messages between cells
   - Directional indicators
   - Trail of previous movements

3. **Location Descriptions**
   - Dynamic text based on time/weather
   - Discovery notifications
   - Environmental storytelling

### Strategic Elements

1. **Resource Nodes**
   - Stamina fountains for regeneration
   - Rest points with bonuses
   - Dangerous areas with penalties

2. **Movement Puzzles**
   - Maze sections
   - One-way passages
   - Timed movement challenges

3. **Competitive Features**
   - Racing between players
   - Territory control
   - Movement-based mini-games

## Configuration Examples

### High-Stamina Adventure
```javascript
{
  "stamina": {
    "defaultMax": 20,
    "regeneration": {
      "type": "incremental",
      "interval": 3600000,  // 1 hour
      "amount": 5
    }
  }
}
```

### Survival Horror
```javascript
{
  "stamina": {
    "defaultMax": 5,
    "regeneration": {
      "type": "full_reset",
      "interval": 86400000  // 24 hours
    }
  },
  "movementCost": {
    "stamina": 2  // High cost per move
  }
}
```

## Best Practices

1. **Clear Communication**
   - Show movement costs upfront
   - Display regeneration timing
   - Indicate valid moves clearly

2. **Balanced Pacing**
   - Allow meaningful exploration per session
   - Avoid frustrating wait times
   - Reward efficient movement

3. **Interesting Choices**
   - Make each move count
   - Hide secrets off main paths
   - Risk/reward for exploration

4. **Performance**
   - Lazy-load channel permissions
   - Cache movement calculations
   - Batch permission updates

## Troubleshooting

### Common Issues

**"This interaction failed" on movement:**
- Check if handler is registered in app.js
- Verify stamina initialization
- Confirm map channels exist

**Player stuck at location:**
- Use admin commands to reset position
- Check permission overwrites
- Verify stamina regeneration

**Movement buttons not appearing:**
- Ensure map is active
- Check player initialization
- Verify channel message posting

---

The Safari Map Movement System creates immersive exploration experiences within Discord, turning server channels into interactive game worlds with strategic movement decisions.