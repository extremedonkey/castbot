# Safari Map Technical Reference

## Architecture Overview

The Safari Map System consists of several interconnected modules that handle map generation, player movement, content management, and Discord integration.

### Core Modules

#### mapExplorer.js
- Map creation and image processing
- Grid overlay generation
- Channel creation and management
- Fog of war generation
- Map deletion and cleanup

#### mapMovement.js
- Player movement validation and execution
- Stamina checking and consumption
- Permission management
- Movement display generation
- Location tracking

#### safariButtonHelper.js
- Location content rendering
- Store attachment buttons
- Item drop buttons
- Currency drop buttons

#### pointsManager.js
- Stamina point tracking
- Regeneration calculations
- Entity point management
- Time-based recovery

## Data Structures

### Map Storage (safariContent.json)

```javascript
{
  "guildId": {
    "maps": {
      "active": "map_10x8_1704236400000",  // Currently active map ID
      "map_10x8_1704236400000": {
        "id": "map_10x8_1704236400000",
        "name": "Adventure Island",
        "gridWidth": 10,                    // Horizontal cells
        "gridHeight": 8,                    // Vertical cells
        "imageFile": "img/{guildId}/map_10x8_1704236400000.png",
        "category": "1234567890",           // Discord category ID
        "createdAt": "2024-01-01T00:00:00Z",
        "createdBy": "adminUserId",
        "blacklistedCoordinates": ["C3", "D4"],  // Restricted locations
        "coordinates": {
          "A1": {
            "channelId": "1234567891",
            "anchorMessageId": "9876543210",
            "baseContent": {
              "title": "Starting Point",
              "description": "Your adventure begins here..."
            },
            "stores": ["store_id_1", "store_id_2"],
            "itemDrops": [
              {
                "itemId": "stamina_potion",
                "buttonText": "💊 Mysterious Vial",
                "buttonStyle": 1,
                "dropType": "per_player",
                "claimedBy": ["userId1", "userId2"]
              }
            ],
            "currencyDrops": [
              {
                "amount": 100,
                "buttonText": "💰 Hidden Treasure",
                "claimedBy": []
              }
            ]
          }
          // ... more coordinates
        }
      }
    },
    "entityPoints": {
      "player_391415444084490240": {
        "stamina": {
          "current": 8,
          "max": 10,
          "lastRegeneration": 1703001234567,
          "lastUse": 1703001234567
        }
      }
    },
    "pointsConfig": {
      "definitions": {
        "stamina": {
          "displayName": "Stamina",
          "emoji": "⚡",
          "defaultMax": 10,
          "defaultMin": 0,
          "regeneration": {
            "type": "full_reset",
            "interval": 43200000,  // 12 hours in milliseconds
            "amount": "max"
          }
        }
      },
      "movementCost": {
        "stamina": 1
      }
    }
  }
}
```

### Player Progress (playerData.json)

```javascript
{
  "guildId": {
    "players": {
      "userId": {
        "safari": {
          "mapProgress": {
            "map_10x8_1704236400000": {
              "currentLocation": "C3",
              "exploredCoordinates": ["A1", "B1", "B2", "C2", "C3"],
              "itemsFound": ["stamina_potion", "map_key"],
              "movementHistory": [
                {
                  "from": "B2",
                  "to": "C3",
                  "timestamp": "2024-01-01T12:00:00Z"
                }
              ]
            }
          }
        }
      }
    }
  }
}
```

## API Reference

### Map Creation

```javascript
// Create map with custom image
async function createMapGridWithCustomImage(guild, userId, imageUrl, columns, rows) {
  // Returns: { success: boolean, message: string, mapId?: string }
}

// Update existing map image
async function updateMapImage(guild, userId, newImageUrl) {
  // Returns: { success: boolean, message: string }
}

// Delete map and all associated data
async function deleteMapGrid(guild, userId) {
  // Returns: { success: boolean, message: string, stats: object }
}
```

### Movement System

```javascript
// Get valid moves from position
async function getValidMoves(currentCoordinate, movementSchema = 'adjacent_8', guildId) {
  // Returns: Array<{ direction, coordinate, customId, label, disabled, blacklisted }>
}

// Execute player movement
async function movePlayer(guildId, userId, newCoordinate, client, options = {}) {
  // options: { bypassStamina: boolean, adminMove: boolean }
  // Returns: { success: boolean, message: string, oldCoordinate?, newCoordinate? }
}

// Get player location
async function getPlayerLocation(guildId, userId) {
  // Returns: { currentCoordinate, lastMovement, visitedCoordinates } | null
}

// Get movement display UI
async function getMovementDisplay(guildId, userId, coordinate) {
  // Returns: Components V2 structure with navigation grid
}
```

### Points Management

```javascript
// Check if entity has enough points
async function hasEnoughPoints(guildId, entityId, pointType, amount) {
  // Returns: boolean
}

// Use points (with validation)
async function usePoints(guildId, entityId, pointType, amount) {
  // Returns: { success: boolean, message?: string, remaining?: number }
}

// Get time until next regeneration
async function getTimeUntilRegeneration(guildId, entityId, pointType) {
  // Returns: string (e.g., "2h 15m")
}
```

### Content Management

```javascript
// Attach store to coordinate
async function attachStoreToCoordinate(guildId, coordinate, storeId) {
  // Updates safariContent.json and anchor message
}

// Add item drop to coordinate
async function addItemDropToCoordinate(guildId, coordinate, itemDrop) {
  // itemDrop: { itemId, buttonText, buttonStyle, dropType }
}

// Add currency drop to coordinate
async function addCurrencyDropToCoordinate(guildId, coordinate, amount, buttonText) {
  // Creates hidden currency reward
}
```

## Button Patterns

### Movement Buttons
```javascript
// Navigation button (shows movement grid)
`safari_navigate_{userId}_{coordinate}`

// Movement execution button
`safari_move_{targetCoordinate}`

// Admin movement display
`safari_show_movement_{userId}_{coordinate}`
```

### Content Buttons
```javascript
// Store access button
`map_coord_store_{coordinate}_{storeId}`

// Item drop button
`map_item_drop_{coordinate}_{index}`

// Currency drop button
`map_currency_{coordinate}_{index}`

// Location actions (admin)
`map_location_actions_{coordinate}`
```

## Discord Integration

### Channel Structure
```
Discord Server
└── 🗺️ Map Explorer (Category)
    ├── #a1 (Text Channel)
    ├── #a2 (Text Channel)
    ├── #b1 (Text Channel)
    └── ... (One per coordinate)
```

### Permission Management

```javascript
// Grant new channel permissions (called FIRST)
async function grantNewChannelPermissions(guildId, userId, coordinate, client) {
  // Adds VIEW_CHANNEL and SEND_MESSAGES to new location
}

// Remove old channel permissions (called AFTER)
async function removeOldChannelPermissions(guildId, userId, coordinate, client) {
  // Removes all permissions from previous location
}
```

**Critical**: Always grant new permissions before removing old ones to prevent lockouts.

### Rate Limiting

```javascript
// Channel creation: 5 channels per 5 seconds
if (i > 0 && i % 5 === 0) {
  await new Promise(resolve => setTimeout(resolve, 5000));
}

// Channel deletion: 5 channels per 2 seconds
if (deletedCount % 5 === 0) {
  await new Promise(resolve => setTimeout(resolve, 2000));
}
```

## Grid Calculations

### Coordinate Conversion

```javascript
// Convert coordinate to grid position
function coordinateToGrid(coordinate) {
  const col = coordinate.charCodeAt(0) - 65; // A=0, B=1, etc.
  const row = parseInt(coordinate.substring(1)) - 1; // 1-based to 0-based
  return { col, row };
}

// Convert grid position to coordinate
function gridToCoordinate(col, row) {
  return String.fromCharCode(65 + col) + (row + 1);
}

// Handle wide maps (>26 columns)
function getExtendedCoordinate(col, row) {
  if (col < 26) {
    return String.fromCharCode(65 + col) + (row + 1);
  } else {
    const firstLetter = String.fromCharCode(65 + Math.floor(col / 26) - 1);
    const secondLetter = String.fromCharCode(65 + (col % 26));
    return firstLetter + secondLetter + (row + 1);
  }
}
```

### Movement Validation

```javascript
// Check if move is valid
function isValidMove(fromCoord, toCoord, gridWidth, gridHeight) {
  const from = coordinateToGrid(fromCoord);
  const to = coordinateToGrid(toCoord);
  
  // Check bounds
  if (to.col < 0 || to.col >= gridWidth) return false;
  if (to.row < 0 || to.row >= gridHeight) return false;
  
  // Check adjacency (8-directional)
  const colDiff = Math.abs(to.col - from.col);
  const rowDiff = Math.abs(to.row - from.row);
  
  return colDiff <= 1 && rowDiff <= 1 && (colDiff + rowDiff) > 0;
}
```

## Image Processing

### Grid Overlay Generation

```javascript
const { createCanvas, loadImage } = require('canvas');

async function addGridToImage(imageBuffer, gridWidth, gridHeight) {
  const img = await loadImage(imageBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  
  // Draw original image
  ctx.drawImage(img, 0, 0);
  
  // Grid parameters (currently hardcoded, see issues)
  const borderSize = 80;
  const lineWidth = 4;
  const fontSize = 40;
  
  // Calculate cell dimensions
  const cellWidth = (img.width - 2 * borderSize) / gridWidth;
  const cellHeight = (img.height - 2 * borderSize) / gridHeight;
  
  // Draw grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = lineWidth;
  
  // Draw coordinates
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  
  return canvas.toBuffer('image/png');
}
```

### Fog of War Generation

```javascript
async function generateFogOfWarMap(baseMapPath, visibleCoordinate, gridWidth, gridHeight) {
  // Load base map with grid
  const img = await loadImage(baseMapPath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  
  // Draw base map
  ctx.drawImage(img, 0, 0);
  
  // Apply fog to all cells except visible one
  const { col, row } = coordinateToGrid(visibleCoordinate);
  
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (x !== col || y !== row) {
        // Apply fog overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(
          borderSize + x * cellWidth,
          borderSize + y * cellHeight,
          cellWidth,
          cellHeight
        );
      }
    }
  }
  
  return canvas.toBuffer('image/png');
}
```

## Performance Considerations

### Caching Strategy
- Navigation interactions cached in memory (`global.navigationInteractions`)
- Map data loaded on-demand from `safariContent.json`
- Player data cached per request to avoid repeated file reads

### File Management
```
img/{guildId}/
  map_{width}x{height}_{timestamp}.png           # Base map with grid
  map_{width}x{height}_{timestamp}_updated.png   # Updated versions
  map_{width}x{height}_{timestamp}_{coord}.png   # Fog of war versions
```

### Optimization Tips
1. **Batch Operations**: Process multiple coordinates together
2. **Lazy Loading**: Only create channels/content when accessed
3. **Rate Limit Awareness**: Respect Discord's 5/5s channel creation limit
4. **Image Compression**: Use PNG optimization for large maps
5. **Cleanup**: Remove old fog maps when updating base image

## Extension Points

### Adding New Movement Schemas
```javascript
// In getValidMoves() function
const directionsToCheck = movementSchema === 'cardinal_4' 
  ? ['north', 'east', 'south', 'west']
  : movementSchema === 'knight_8'
  ? calculateKnightMoves(col, row)  // Custom L-shaped moves
  : Object.keys(moves);  // Default adjacent_8
```

### Custom Point Types
```javascript
// Add to pointsConfig.definitions
"mana": {
  "displayName": "Mana",
  "emoji": "🔮",
  "defaultMax": 50,
  "regeneration": {
    "type": "incremental",
    "interval": 60000,  // 1 minute
    "amount": 5
  }
}
```

### Location Events
```javascript
// Hook into movePlayer() success
if (result.success) {
  await triggerLocationEvent(guildId, userId, newCoordinate);
}
```

---

For user documentation, see [Safari Map System Guide](SafariMapSystem.md).
For known issues and roadmap, see [Safari Map Issues & Roadmap](SafariMapIssues.md).