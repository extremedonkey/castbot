# Safari Map Movement System Documentation

## Overview

The Safari Map Movement System enables players to explore grid-based maps with stamina-limited movement and Discord channel-based location representation. Players physically "move" between Discord channels representing map coordinates, creating an immersive exploration experience.

### Current Implementation Status (January 2025)

✅ **Core Movement System** - Complete with 8-directional movement
✅ **Non-Square Map Support** - Proper boundary checking for rectangular grids
✅ **Navigation UI** - Navigate button pattern with ephemeral movement options
✅ **Permission Management** - Automatic channel access control with proper ordering
✅ **Stamina Integration** - Points-based movement limitation with regeneration
✅ **Admin Controls** - Full player management and positioning tools
✅ **Message Management** - Smart UI updates to prevent stale interactions
✅ **Dynamic Grid Support** - Works with any map size from 1x1 to 100x100
🔄 **Cell Content** - Next phase for interactive location content

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
10. [Technical Architecture](#technical-architecture)
11. [Zero-Context Implementation Guide](#zero-context-implementation-guide)

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

#### Non-Square Map Behavior

For non-square maps, movement properly respects the actual grid boundaries:

**Example: 3x1 Horizontal Map (A1, B1, C1)**
- From A1: Can only move East to B1
- From B1: Can move West to A1 or East to C1
- From C1: Can only move West to B1

**Example: 1x3 Vertical Map (A1, A2, A3)**
- From A1: Can only move South to A2
- From A2: Can move North to A1 or South to A3
- From A3: Can only move North to A2

**Example: 2x2 Small Map**
- From A1: Can move East (B1), South (A2), or Southeast (B2)
- All diagonal moves respect both width and height boundaries

### Movement Process

1. **Player clicks Navigate button** → `safari_navigate_{userId}_{coordinate}`
2. **System shows movement options** → Ephemeral 3x3 grid of directions
3. **Player selects direction** → `safari_move_{targetCoordinate}`
4. **System validates move** → Must be adjacent based on schema
5. **Checks stamina** → Must have at least 1 point (configurable)
6. **Updates location** → Records new position in player data
7. **Grants new permissions** → Add access to new channel FIRST
8. **Removes old permissions** → Remove access to old channel AFTER
9. **Deducts stamina** → Uses configured amount (default: 1)
10. **Posts arrival message** → Welcome message with new Navigate button
11. **Updates navigation UI** → Disables buttons in original message

## Permission System

### Channel Visibility
- **Current Location**: VIEW_CHANNEL + SEND_MESSAGES
- **Previous Locations**: No permissions (complete blackout)
- **Unexplored Areas**: No permissions

### Permission Updates
```javascript
// On movement from A1 to B1 - ORDER MATTERS!
// 1. FIRST: Grant access to new channel
await grantNewChannelPermissions(guildId, userId, 'B1', client);

// 2. THEN: Remove access to old channel
await removeOldChannelPermissions(guildId, userId, 'A1', client);

// This order prevents players being locked out during transitions
```

### Security
- Server-side validation of all movements
- Permission checks before granting access
- Rate limiting on movement commands

## Player Experience

### Starting the Adventure

1. **Initialize on Map**
   - Open player menu with `/menu`
   - Click "Start Exploring" button (requires map to exist)
   - System places player at starting position (default: A1)
   - Grants 10 starting stamina
   - Posts welcome message with Navigate button in starting channel

2. **Navigation Interface**
   - Click the "Navigate" button in any location channel
   - Ephemeral movement grid appears (only you can see it):
   ```
   ## 🗺️ Current Location: C3
   
   Choose a direction to move:
   
   ⚡ Stamina: 7/10
   
   [↖️ B2] [⬆️ B3] [↗️ B4]
   [⬅️ C2] [📍 C3] [➡️ C4]
   [↙️ D2] [⬇️ D3] [↘️ D4]
   ```

3. **Moving Between Locations**
   - Click any directional button (if you have stamina)
   - Navigation UI updates to show "You have moved to [location]"
   - All buttons become disabled (prevents duplicate moves)
   - New channel becomes visible automatically
   - Arrival message with fresh Navigate button posts in new channel
   - Old channel permissions removed (complete blackout)

### Stamina Management

**With Stamina:**
- Buttons are blue and clickable
- Can move to any adjacent cell

**Without Stamina:**
- Buttons are gray and disabled
- Shows "Rest for 7h 23m" message
- Must wait for regeneration

## Technical Implementation

### File Structure
- **`mapMovement.js`** - Core movement logic and validation
- **`safariMapAdmin.js`** - Admin controls and player management
- **`app.js`** - Button handlers for navigation and movement
- **`buttonHandlerFactory.js`** - Factory pattern for button handling

### Data Storage

**Player Map Progress (playerData.json):**
```json
{
  "guildId": {
    "players": {
      "userId": {
        "safari": {
          "mapProgress": {
            "map_5x5_1704236400000": {
              "currentCoordinate": "C3",
              "exploredCoordinates": ["A1", "B1", "B2", "C2", "C3"],
              "movementHistory": [
                {"from": null, "to": "A1", "timestamp": 1704236400000},
                {"from": "A1", "to": "B1", "timestamp": 1704236500000}
              ]
            }
          }
        }
      }
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
// Check if move is valid based on adjacency
isValidMove(fromCoordinate, toCoordinate, movementSchema = 'adjacent_8')
// Returns: boolean

// Get all valid moves from current position  
getValidMoves(currentCoordinate, movementSchema = 'adjacent_8')
// Returns: Array of coordinate strings ['B2', 'B3', 'B4', ...]
```

#### Execute Movement
```javascript
// Main movement function with full validation and updates
movePlayer(guildId, userId, newCoordinate, client = null)
// Returns: { 
//   success: boolean,
//   message: string,
//   oldCoordinate: string,
//   newCoordinate: string,
//   staminaUsed: number
// }
```

#### Permission Management
```javascript
// Grant access to new channel (called FIRST)
grantNewChannelPermissions(guildId, userId, coordinate, client)

// Remove access to old channel (called AFTER)
removeOldChannelPermissions(guildId, userId, coordinate, client)
```

#### Movement Display
```javascript
// Generate movement UI based on context
getMovementDisplay(guildId, userId, coordinate, isInteractionResponse = true)
// Returns: Discord message object with proper Components V2 structure
```

#### Navigation Interaction Storage
```javascript
// Global storage for editing navigation messages later
global.navigationInteractions = new Map();
// Key: `${userId}_${coordinate}` 
// Value: { token: string, appId: string }
```

## Admin Controls

### Map Admin Interface (`/menu` → Production Menu → Safari → Map Explorer)

#### Player Admin (`🧭 Player Admin`)
- Shows dropdown of all server members
- Displays current player status (initialized/not initialized)
- Shows current location and stamina if initialized

#### Paused Players (`⏸️ Paused Players`)
**Purpose**: Temporarily remove players from Safari channels while maintaining their state

**When to Use**:
- Players voted out who need to be suspended from the game
- During tribe swaps or merges when Safari needs to pause
- Individual player management for rule violations or AFK status
- Mass pause for production events

**Features**:
- Shows only initialized Safari players (not all server members)
- Visual indicators: ⏸️ for paused, ▶️ for active players
- Multi-select up to 25 players at once
- Instant apply - no save button needed
- Preserves all player data: location, currency, inventory, interactions

**How it Works**:
1. Click "Paused Players" button in Map Explorer
2. Select/deselect players from dropdown (pre-selected if already paused)
3. System immediately updates permissions:
   - Selected players: Lose access to their current Safari channel
   - Deselected players: Regain access to their current location
4. Players maintain their `currentLocation` for easy resumption

**Technical Details**:
- Data stored in `playerData.json` under `safari.isPaused`
- Uses `removeOldChannelPermissions` to hide channels
- Uses `grantNewChannelPermissions` to restore access
- Batch processing with Promise.all() for performance

#### Available Player Actions

**1. Initialize on Map** (`map_admin_init_player`)
```javascript
// Places player at starting position with full stamina
await initializePlayerOnMap(guildId, userId, startingCoordinate, mapId);
// - Grants channel permissions
// - Sets stamina to 10
// - Posts welcome message with Navigate button
```

**2. Move Player** (`map_admin_move_player`)
```javascript
// Forcibly moves player without stamina cost
await setPlayerMapLocation(guildId, userId, newCoordinate);
// - Updates permissions automatically
// - Posts movement interface in new channel
// - No stamina deduction
```

**3. Grant Stamina** (`map_admin_grant_stamina`)
```javascript
// Add stamina points (special values: 99 = test mode with 999 stamina)
await setPlayerStamina(guildId, userId, amount);
// - Can exceed normal maximum
// - Useful for testing
```

**4. Reset Explored** (`map_admin_reset_explored`)
```javascript
// Clear exploration history while maintaining current position
// - Keeps player at current location
// - Clears exploredCoordinates array
// - Preserves stamina and other stats
```

**5. Edit Currency** (`map_admin_edit_currency`)
- Set Safari currency amount via modal
- Integrated with Safari points system

**6. View Raw Data** (`map_admin_view_raw`)
- Display complete Safari data structure
- Useful for debugging state issues

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

### Current Implementation
**adjacent_8** (Default): Move to any of 8 adjacent cells
- Cardinal directions: North, South, East, West  
- Diagonal directions: Northeast, Northwest, Southeast, Southwest
- Most flexible movement pattern
- Standard for all current maps

**Movement Validation Matrix:**
```javascript
// From C3, valid moves are:
const validOffsets = [
  [-1, -1], [-1, 0], [-1, 1],  // B2, B3, B4
  [0, -1],           [0, 1],    // C2,     C4
  [1, -1],  [1, 0],  [1, 1]     // D2, D3, D4
];
```

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

## Implementation Patterns

### Button Handler Architecture

**Navigation Handler** (`safari_navigate_*`):
```javascript
// Uses ButtonHandlerFactory for consistency
ButtonHandlerFactory.create({
  id: `safari_navigate_${userId}_${coordinate}`,
  ephemeral: true,
  handler: async (context) => {
    // 1. Delete arrival message that had Navigate button
    // 2. Get movement display for current location
    // 3. Store interaction token for later editing
    // 4. Return ephemeral movement grid
  }
})
```

**Movement Handler** (`safari_move_*`):
```javascript
ButtonHandlerFactory.create({
  id: `safari_move_${targetCoordinate}`,
  deferred: true,  // Movement takes time
  ephemeral: true,
  handler: async (context) => {
    // 1. Validate player is in correct channel
    // 2. Execute movement with validation
    // 3. Post arrival message in new channel
    // 4. Edit original navigation message to disable buttons
    // 5. Delete deferred "thinking" message
  }
})
```

### Message Flow Architecture

1. **Channel Messages** (visible to all):
   - Arrival messages with Navigate button
   - Use Components V2 with Container structure
   - Include welcome text and navigation prompt

2. **Ephemeral Messages** (user-only):
   - Movement grids from Navigate button
   - Error messages and feedback
   - Admin control responses

3. **Message Editing Pattern**:
   - Store interaction tokens during navigation
   - Edit after successful movement
   - Clean up stored tokens
   - Handle edit failures gracefully

### Permission Management Best Practices

1. **Always Grant Before Remove**:
   ```javascript
   // ✅ CORRECT ORDER
   await grantNewChannelPermissions(...);  // First
   await removeOldChannelPermissions(...); // Second
   ```

2. **Handle Bot Permissions**:
   - Bot needs VIEW_CHANNEL in all map channels
   - Bot needs SEND_MESSAGES for posting arrivals
   - Bot needs MANAGE_ROLES for permission updates

3. **Error Recovery**:
   - If permission grant fails, don't remove old
   - Log all permission errors for debugging
   - Provide admin tools to fix stuck players

## Troubleshooting

### Common Issues

**"This interaction failed" on movement:**
- Movement takes >3 seconds, requires `deferred: true`
- Check console for handler registration
- Verify ButtonHandlerFactory setup

**"CastBot is thinking..." persists:**
- Deferred response not properly handled
- Solution: Delete deferred message after movement
- Check for errors in movement process

**Player stuck between channels:**
- Permission order issue (removed before granted)
- Use Map Admin to force move player
- Check logs for permission errors

**Movement buttons not appearing:**
- Player not initialized on map
- Map channels don't exist
- Bot lacks permissions in channel

**Stale movement buttons:**
- Player moved but old buttons remain active
- Solution: Channel validation in movement handler
- Navigation message editing after movement

**Navigation UI shows wrong location:**
- Cached location data
- Movement didn't complete properly
- Use Map Admin to view raw data

### Debug Commands

```javascript
// Check player location
const location = await getPlayerLocation(guildId, userId);
console.log('Current:', location.currentCoordinate);

// View stamina status  
const stamina = await getEntityPoints(guildId, `player_${userId}`, 'stamina');
console.log('Stamina:', stamina.current, '/', stamina.max);

// Force permission refresh
await grantNewChannelPermissions(guildId, userId, coordinate, client);
```

---

The Safari Map Movement System creates immersive exploration experiences within Discord, turning server channels into interactive game worlds with strategic movement decisions.