# Safari Map Explorer System Documentation

This document serves as the source of truth for the Safari Map Explorer feature - a grid-based map exploration system that allows players to upload images and explore them through Discord channels.

## Table of Contents

1. [Feature Overview](#feature-overview)
2. [Technical Architecture Options](#technical-architecture-options)
3. [Image Upload/Download Methods](#image-uploaddownload-methods)
4. [Grid Processing Approaches](#grid-processing-approaches)
5. [Channel Creation Strategy](#channel-creation-strategy)
6. [Data Storage Design](#data-storage-design)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Technical Considerations](#technical-considerations)
9. [Security & Performance](#security--performance)
10. [Future Enhancements](#future-enhancements)

## Feature Overview

The Safari Map Explorer allows:
- **Admins to upload custom map images via Discord CDN URLs** ✅ IMPLEMENTED
- **Dynamic grid sizes from 1x1 to 100x100** ✅ IMPLEMENTED (no longer fixed to 7x7)
- **Non-square map support** ✅ IMPLEMENTED (e.g., 3x1, 1x5, 2x10)
- Automatic grid overlay and coordinate system generation (A1, B2, C3, etc.) ✅ IMPLEMENTED
- Creation of Discord channels for each grid coordinate ✅ IMPLEMENTED
- Players exploring the map by moving between grid channels ✅ IMPLEMENTED
- Visual feedback showing explored vs unexplored areas (fog of war) ✅ IMPLEMENTED
- **Map updates without deletion** ✅ IMPLEMENTED (replace image while preserving data)

### Core User Flow
1. Admin uploads image to Discord, copies CDN URL
2. Admin uses "Create/Update Map" button and pastes URL
3. Admin specifies desired grid dimensions (e.g., 5x5, 3x1, 10x8)
4. Bot downloads image and overlays the specified grid
5. Bot creates Discord channels for each coordinate
6. Bot generates fog of war maps for each location
7. Players explore by moving between coordinate channels

## Technical Architecture Options

### Option 1: Node.js Native with Canvas API (Recommended)
**Pros:**
- Pure JavaScript solution using `node-canvas` package
- No external dependencies or services
- Full control over image processing
- Works seamlessly in existing Node.js environment

**Cons:**
- Need to handle image processing algorithms
- More complex grid detection logic

**Key Libraries:**
- `node-canvas` - Canvas API implementation for Node.js
- `sharp` - High-performance image processing
- `jimp` - Pure JavaScript image manipulation

### Option 2: Python Microservice with OpenCV
**Pros:**
- Powerful computer vision capabilities
- Advanced grid detection algorithms
- Mature image processing ecosystem

**Cons:**
- Requires separate Python service
- Additional deployment complexity
- Inter-process communication overhead

### Option 3: External API Service
**Pros:**
- Offload processing to specialized service
- Potentially more advanced features
- Scalability handled externally

**Cons:**
- Dependency on third-party service
- Potential costs
- Privacy concerns with user uploads

## Image Upload Process (CURRENT IMPLEMENTATION)

### Current Method: Discord CDN URL via Modal

1. **Admin uploads image to any Discord channel**
   - Can be done in any server/channel they have access to
   - Right-click image → "Copy Link" to get CDN URL
   - URL format: `https://cdn.discordapp.com/attachments/...`

2. **Admin clicks "Create/Update Map" button**
   - Opens modal requesting:
     - Discord CDN URL
     - Number of columns (1-100)
     - Number of rows (1-100)
   - Bot validates URL format and dimensions

3. **Bot processes the image**
   - Downloads image from Discord CDN
   - Applies 7x7 grid overlay
   - Generates fog of war versions
   - Creates Discord channels

**Current Limitations:**
- Only accepts Discord CDN URLs (security measure)
- Maximum 400 total channels (Discord limitation)
- Hardcoded grid visual parameters (see MapGridScaling.md)
- Maps cannot be resized after creation (must delete and recreate)

### Method 2: URL-Based Upload
```javascript
// User provides image URL
const imageUrl = interaction.options.getString('map_url');
const imageBuffer = await fetch(imageUrl).then(res => res.buffer());
```

**Pros:**
- Works with any hosted image
- No Discord size limitations

**Cons:**
- Requires users to host images
- Security concerns with external URLs

### Method 3: Multi-Step Upload Process
1. Bot creates temporary upload channel
2. User uploads image as message attachment
3. Bot processes and confirms
4. Bot deletes temporary channel

**Pros:**
- Better for large images
- More control over process

**Cons:**
- More complex user flow
- Requires channel management

## Grid Processing Approaches

### Approach 1: Fixed Grid Overlay
```javascript
// Using node-canvas
const { createCanvas, loadImage } = require('canvas');

async function addGridToImage(imageBuffer, gridSize = 10) {
    const img = await loadImage(imageBuffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    
    // Draw original image
    ctx.drawImage(img, 0, 0);
    
    // Calculate cell dimensions
    const cellWidth = img.width / gridSize;
    const cellHeight = img.height / gridSize;
    
    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    
    // Vertical lines
    for (let x = 0; x <= gridSize; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cellWidth, 0);
        ctx.lineTo(x * cellWidth, img.height);
        ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = 0; y <= gridSize; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cellHeight);
        ctx.lineTo(img.width, y * cellHeight);
        ctx.stroke();
    }
    
    // Add coordinate labels
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const label = `${String.fromCharCode(65 + x)}${y + 1}`;
            const textX = x * cellWidth + cellWidth / 2 - 15;
            const textY = y * cellHeight + cellHeight / 2 + 7;
            
            ctx.strokeText(label, textX, textY);
            ctx.fillText(label, textX, textY);
        }
    }
    
    return canvas.toBuffer('image/png');
}
```

### Approach 2: Smart Grid Detection
- Detect existing grid lines in the image
- Use edge detection algorithms
- Allow manual adjustment of grid alignment

### Approach 3: User-Defined Grid Points
- User clicks corner points
- Bot calculates grid based on perspective
- More flexible for non-rectangular maps

## Channel Creation Strategy

### Strategy 1: Lazy Channel Creation (Recommended)
```javascript
// Only create channels as players explore
async function moveToCoordinate(guildId, userId, coordinate) {
    const channelName = `safari-map-${coordinate.toLowerCase()}`;
    let channel = guild.channels.cache.find(ch => ch.name === channelName);
    
    if (!channel) {
        channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: safariCategoryId,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: userId,
                    allow: [PermissionFlagsBits.ViewChannel]
                }
            ]
        });
    }
    
    // Add user to channel if not already there
    await channel.permissionOverwrites.edit(userId, {
        ViewChannel: true
    });
    
    return channel;
}
```

### Strategy 2: Pre-create All Channels
- Create all coordinate channels upfront
- Hide/show based on exploration
- Better for smaller grids

### Strategy 3: Virtual Channels
- Use a single channel with embedded messages
- Update message content based on location
- No channel spam

## Data Storage Design

### Safari Map Data Structure
```javascript
// In safariContent.json
{
    "maps": {
        "mapId_123": {
            "id": "mapId_123",
            "name": "Treasure Island",
            "guildId": "123456789",
            "imageUrl": "https://...",
            "gridWidth": 10,
            "gridHeight": 10,
            "coordinates": {
                "A1": {
                    "channelId": "987654321",
                    "description": "Rocky shores with crashing waves",
                    "textPrompts": {
                        "onEnter": "The salty breeze hits your face as waves crash against jagged rocks.",
                        "onExamine": "You notice something glinting between the rocks...",
                        "onSearch": "After carefully searching, you find a weathered treasure chest!"
                    },
                    "items": [
                        {
                            "id": "treasure_chest",
                            "name": "Weathered Treasure Chest",
                            "description": "An old chest partially buried in the sand",
                            "discoverable": true,
                            "collectable": true,
                            "requiresKey": false
                        }
                    ],
                    "hiddenCommands": [
                        {
                            "trigger": "climb rocks",
                            "response": "You climb the rocks and spot a hidden cave entrance!",
                            "unlocks": "A2",
                            "requiresItem": null
                        }
                    ],
                    "navigationOptions": {
                        "north": { "to": "A2", "blocked": false, "description": "Dense jungle path" },
                        "east": { "to": "B1", "blocked": false, "description": "Sandy beach continues" },
                        "south": { "to": null, "blocked": true, "description": "Treacherous cliffs" },
                        "west": { "to": null, "blocked": true, "description": "Open ocean" }
                    },
                    "exploredBy": ["userId1", "userId2"],
                    "cellType": "coast",
                    "difficulty": 1,
                    "requiresPermission": false,
                    "customData": {
                        "weatherEffect": "windy",
                        "ambientSound": "ocean_waves.mp3"
                    }
                },
                "A2": {
                    "channelId": null,
                    "description": "Dense jungle with towering trees",
                    "textPrompts": {
                        "onEnter": "Thick vines and exotic sounds surround you in this verdant jungle.",
                        "onExamine": "The canopy blocks most sunlight, creating an eerie green glow.",
                        "onSearch": "You hear movement in the undergrowth..."
                    },
                    "items": [],
                    "hiddenCommands": [
                        {
                            "trigger": "follow sound",
                            "response": "You discover a small clearing with ancient ruins!",
                            "unlocks": "secret_area_jungle",
                            "requiresItem": null
                        }
                    ],
                    "navigationOptions": {
                        "north": { "to": "A3", "blocked": false, "description": "Jungle path continues" },
                        "east": { "to": "B2", "blocked": true, "description": "Thick brambles block the way" },
                        "south": { "to": "A1", "blocked": false, "description": "Return to the coast" },
                        "west": { "to": null, "blocked": true, "description": "Impassable jungle" }
                    },
                    "exploredBy": [],
                    "cellType": "jungle",
                    "difficulty": 2,
                    "requiresPermission": false,
                    "customData": {
                        "weatherEffect": "humid",
                        "ambientSound": "jungle_sounds.mp3"
                    }
                }
                // ... more coordinates
            },
            "playerLocations": {
                "userId1": "A1",
                "userId2": "B3"
            },
            "createdAt": "2024-01-01T00:00:00Z",
            "createdBy": "adminUserId"
        }
    }
}
```

### Player Progress Structure
```javascript
// In playerData.json
{
    "guildId": {
        "players": {
            "userId": {
                "safari": {
                    "mapProgress": {
                        "mapId_123": {
                            "currentLocation": "A1",
                            "exploredCoordinates": ["A1", "A2", "B1"],
                            "itemsFound": ["treasure_chest"],
                            "movementHistory": [
                                { "from": null, "to": "A1", "timestamp": "..." },
                                { "from": "A1", "to": "A2", "timestamp": "..." }
                            ]
                        }
                    }
                }
            }
        }
    }
}
```

## Enhanced Grid Cell Data Structure Design

### Current Implementation Status
✅ **Custom Image Upload:** Complete - admins can upload any Discord CDN image URL
✅ **Grid Generation:** Complete - overlays 7x7 grid on custom images
✅ **Coordinate System:** Complete - standard letter-number format (A1-G7)
✅ **Fog of War:** Complete - each location shows only visible cell, others fogged
✅ **Map Creation System:** Complete - generates maps and Discord infrastructure
✅ **Map Update System:** Complete - can replace existing map image
✅ **Data Storage:** Complete - integrated with Safari system via safariContent.json
✅ **UI Integration:** Complete - Map Explorer added to Safari menu system
✅ **Player Movement:** Complete - full navigation system with Navigate button pattern
✅ **Permission Management:** Complete - automatic channel access control
✅ **Admin Controls:** Complete - Map Admin interface for player management
⚠️ **Grid Visual Scaling:** Hardcoded parameters - needs dynamic scaling based on image size
✅ **Dynamic Grid Dimensions:** Maps can be any size from 1x1 to 100x100
✅ **Non-Square Maps:** Full support for rectangular grids
🔄 **Cell Content Management:** Next phase - editing individual cell content

### Technical Capabilities

#### Core Grid System
- **Custom Maps:** Accepts any Discord CDN image URL for map creation
- **Grid Overlay:** MapGridSystem class generates grids of various sizes (5x5, 8x8, 10x10, 12x12)
- **Recommended Style:** Thick grid lines (4px) with white borders for maximum visibility
- **Coordinate System:** Standard letter-number format (A1-E5 for 5x5 grid)

#### Image Processing & Extraction
- **Tile Extraction:** ✅ PROVEN - Can extract individual grid cells from rendered maps
  - Successfully extracted map_c8.png (250x250px tile from 10x10 grid)
  - Can identify exact pixel coordinates for any grid cell
  - **Capability confirmed:** Can draw player icons or markers on specific coordinates
  - Created proof-of-concept tiles: map_a1.png, map_e5.png, map_a5.png, map_e1.png

#### File Storage & Organization
- **Map Storage:** `{guildId}/map_{gridSize}x{gridSize}_{timestamp}.png`
- **Custom Images:** Downloads and processes user-provided Discord CDN URLs
- **Directory Structure:** Guild-specific folders for organized map storage
- **Tile Storage:** Future capability for `img/{guildId}/tiles/` individual cell images

### Architecture Decisions

#### 1. Interface Integration
- **Menu System:** Reuse existing button-menu interface via /menu (player menu)
- **Safari Buttons:** Leverage existing Safari button system for cell interactions
- **Management UI:** New 'Map' button in prod_safari_menu container interface
- **Channel Creation:** One Discord channel per grid coordinate in 🗺️ Map category

#### 2. Grid Specifications
- **Flexible Size:** 1x1 to 100x100 grids (maximum 400 total cells)
- **Non-Square Support:** Any rectangular dimension (e.g., 3x1, 5x10, 2x2)
- **Minimum Requirements:** No minimum (even 1x1 maps supported for testing)
- **Coordinate System:** Dynamic letter-number based on dimensions
  - Columns: A-Z, then AA-AZ, BA-BZ, etc.
  - Rows: 1-100
- **Image Source:** Custom Discord CDN URLs provided by admins
- **Grid Parameters:** Currently hardcoded (see MapGridScaling.md for improvement plans)

#### 3. Player State Management
- **Shared Base Content:** All players see same cell descriptions
- **Individual State:** Each player tracks their own progress/items found
- **Chest Options:** Configurable as either individual (each player can loot) or shared (first come, first served)
- **Movement System:** Stamina-based with configurable moves per turn

#### 4. Content Structure per Cell
- **Description Text:** Primary content describing what players see
- **Safari Buttons:** Interactive elements using existing Safari action system
- **Clues/Hints:** Embedded in descriptions or revealed through actions
- **Items:** Discoverable objects that integrate with Safari inventory
- **Navigation:** Movement options to adjacent cells

#### 5. Technical Implementation

**Channel Creation Strategy:**
- Implement rate limiting: 5 channels per 5 seconds (Discord recommended)
- Recovery mechanism for interruptions
- Progress tracking and logging during creation
- Cleanup functionality for map deletion

**File Storage Pattern:**
```
img/
  {guildId}/
    map_5x5_{timestamp}.png     # Full map with grid
    map_8x8_{timestamp}.png     # Different size maps
    tiles/                      # Individual cell extracts if needed
      map_{timestamp}_A1.png
      map_{timestamp}_A2.png
```

**Data Integration:**
- ✅ **IMPLEMENTED:** Extends `safariContent.json` with new `maps` section
- ✅ **IMPLEMENTED:** Links Discord channel IDs to grid coordinates
- ✅ **IMPLEMENTED:** Stores complete map metadata and coordinate data
- 🔄 **PLANNED:** Player position tracking and exploration state
- 🔄 **PLANNED:** Integration with existing Safari currency/shop systems

#### Discord Infrastructure Management
- **Category Creation:** Creates "🗺️ Map Explorer" category for map channels
- **Channel Creation:** Generates one channel per coordinate (#a1, #a2, etc.)
- **Rate Limiting:** 5 channels per 5 seconds to comply with Discord API limits
- **Permission Management:** Channels hidden by default, revealed as players explore
- **Cleanup System:** Complete removal of channels and data when map is deleted
- **Recovery Handling:** Graceful error handling for interrupted channel creation

### Movement System Integration

#### Current Button Handlers
- `safari_navigate_{userId}_{coordinate}` - Shows movement options grid
- `safari_move_{coordinate}` - Executes movement to target coordinate
- `safari_show_movement_{userId}_{coordinate}` - Admin-triggered movement display
- `map_admin_*` - Full suite of admin controls

#### Map-Specific Safari Button Actions (Planned)
New action types to be added to the Safari button system:
- `move_player` - Moves player to adjacent grid cell
- `check_location` - Validates player is at specific coordinate
- `give_map_item` - Adds location-specific item to inventory
- `mark_searched` - Marks location as searched by player
- `mark_chest_opened` - Records chest as opened (for shared chests)
- `broadcast_discovery` - Announces major discoveries server-wide
- `unlock_path` - Opens new movement options
- `trigger_event` - Starts location-based events

These will extend the existing Safari action system without breaking current functionality.

## Implementation Roadmap

### Phase 1: Core Image Processing ✅ COMPLETED
1. ✅ Implement custom image upload via Discord CDN URL
2. ✅ Add grid overlay functionality with 7x7 grid
3. ✅ Generate fog of war maps for each coordinate
4. ✅ Store map metadata and CDN URLs

### Navigation Implementation Architecture

#### User Flow
1. **Initialization**: Player uses `/menu` → clicks "Start Exploring"
2. **First Channel**: Receives welcome message with Navigate button at A1
3. **Navigation**: Click Navigate → ephemeral movement grid appears
4. **Movement**: Select direction → permissions update → arrive at new location
5. **Continuation**: New Navigate button in arrival message

#### Technical Flow
```mermaid
graph TD
    A[Navigate Button Click] --> B[Delete Arrival Message]
    B --> C[Show Movement Grid]
    C --> D[Store Interaction Token]
    D --> E[Player Selects Direction]
    E --> F[Validate Movement]
    F --> G[Check Stamina]
    G --> H[Update Location Data]
    H --> I[Grant New Permissions]
    I --> J[Remove Old Permissions]
    J --> K[Post Arrival Message]
    K --> L[Edit Navigation UI]
    L --> M[Delete Thinking Message]
```

#### Key Design Decisions
- **Ephemeral Navigation**: Reduces channel clutter
- **Navigate Button Pattern**: Clean interface, self-deleting
- **Permission Order**: Grant-then-remove prevents lockouts
- **Message Editing**: Updates original UI to prevent confusion
- **Deferred Handling**: Manages long-running permission updates

### Phase 2A: Basic Map Creation & Management ✅ COMPLETED

#### Core Implementation
1. ✅ **UI Integration:** Added Map Explorer button to Safari menu
2. ✅ **Custom Upload:** Create/Update Map button with modal for Discord URL
3. ✅ **Map Generation:** Downloads custom image and applies grid
4. ✅ **Map Update:** Can replace existing map image
5. ✅ **Map Deletion:** Complete cleanup of channels and data
6. ✅ **Data Persistence:** Integrated with Safari content system

#### Create Map Process (Current)
- ✅ Downloads image from Discord CDN URL
- ✅ Generates custom-sized grid overlay (e.g., 5x5, 3x1, 10x8)
- ✅ Saves processed image to `img/{guildId}/map_{width}x{height}_{timestamp}.png`
- ✅ Creates Discord category "🗺️ Map Explorer" 
- ✅ Creates channels for each coordinate with rate limiting
- ✅ Generates fog of war map for each coordinate
- ✅ Posts anchor messages with navigation buttons
- ✅ Stores complete map data structure in `safariContent.json`
- ✅ Progress reporting during channel creation process
- ✅ Error handling and recovery for interrupted operations

#### Delete Map Process (Detailed)
- ✅ Removes all map channels with rate limiting (2 second delays)
- ✅ Deletes the map category
- ✅ Cleans up generated map image files
- ✅ Preserves base `map.png` file for future use
- ✅ Removes map data from safariContent.json storage
- ✅ Progress reporting during cleanup process

#### Technical Architecture Completed
- ✅ **File Structure:** `mapExplorer.js` - 400+ lines of core functionality
- ✅ **Button Handlers:** 3 new handlers in app.js (safari_map_explorer, map_create, map_delete)
- ✅ **Data Layer:** Safari content integration with load/save pattern
- ✅ **UI Components:** Components V2 interface with proper state management
- ✅ **Error Handling:** Comprehensive try/catch with user feedback
- ✅ **Documentation:** Button handlers registered in ButtonHandlerRegistry.md

#### MapGridSystem Capabilities
- ✅ **Grid Generation:** Supports any size from 1x1 to 100x100
- ✅ **Non-Square Grids:** Full support for rectangular maps (width ≠ height)
- ✅ **Styling Options:** Customizable border size, line width, fonts, colors
- ✅ **Coordinate Systems:** Standard (A1-Z99), extended for wide maps (AA1, AB1, etc.)
- ✅ **Programmatic Access:** Coordinate ↔ pixel conversion functions
- ✅ **Marker System:** Can highlight specific cells and draw on coordinates
- ✅ **Tile Extraction:** Proven capability to extract individual grid cells

#### Data Structure Implementation
```json
{
  "guildId": {
    "maps": {
      "active": "map_5x5_1704236400000",
      "map_5x5_1704236400000": {
        "id": "map_5x5_1704236400000",
        "name": "Adventure Island",
        "gridWidth": 5,
        "gridHeight": 5,
        "imageFile": "img/391415444084490240/map_5x5_1704236400000.png",
        "category": "1234567890",
        "coordinates": {
          "A1": {
            "channelId": "1234567891",
            "baseContent": { /* cell content */ },
            "navigation": { /* movement options */ }
          }
        },
        "playerStates": { /* individual player progress */ },
        "globalState": { /* shared map state */ },
        "config": { /* map settings */ }
      }
    }
  }
}
```

### Phase 2B: Player Movement System ✅ COMPLETED
1. ✅ **Navigation Interface:** Navigate button with ephemeral movement grid
2. ✅ **Movement Validation:** 8-directional movement with adjacency checks
3. ✅ **Stamina Integration:** Points-based movement limitation
4. ✅ **Permission Flow:** Automatic channel access management
5. ✅ **Admin Tools:** Complete player management interface

### Phase 2D: Cell Content Management (Next Steps)
1. 🔄 Extend entityManagementUI.js for cell content editing
2. 🔄 Implement map cell editor interface
3. 🔄 Add Safari button integration for location-specific content
4. 🔄 Create interactive elements at coordinates

### Phase 2C: Movement & Exploration ✅ COMPLETED
1. ✅ **Movement Commands:** Navigate button + directional movement grid
2. ✅ **Stamina System:** Entity points integration with configurable regeneration
3. ✅ **Permission Management:** Automatic grant/remove with proper ordering
4. ✅ **Player State Tracking:** Complete progress tracking per map

#### Implementation Details
- **Navigation Pattern:** Players click Navigate → see movement options → select direction
- **UI Updates:** Original navigation message edited to show completion
- **Arrival System:** New Navigate button posted in destination channel
- **Security:** Channel validation prevents using stale movement buttons

### Phase 3: Exploration Features
1. Add fog of war (show/hide unexplored areas)
2. Implement item placement system
3. Create movement restrictions (walls, obstacles)
4. Add visual progress tracking

### Phase 4: Advanced Features
1. Multi-floor/layer support
2. NPC placement and interactions
3. Quest/objective system
4. Collaborative exploration

## Technical Considerations

### Discord Limitations
- **Channel Limit**: 500 channels per server
  - Solution: Use categories, lazy creation, or virtual channels
- **Rate Limits**: Channel creation is rate-limited
  - Solution: Queue channel creation, use batching
- **Permission Overwrites**: Limited to 500 per channel
  - Solution: Use role-based permissions for groups

### Known Issues & Limitations

#### Grid Scaling Problem
- **Issue**: Grid parameters (border, line width, font size) are hardcoded
  - **Symptom**: Small images have oversized text, large images have tiny text
  - **Root Cause**: Fixed values regardless of image dimensions
  - **Solution**: Implement dynamic scaling (see MapGridScaling.md)
  - **Current Values**: borderSize: 80, lineWidth: 4, fontSize: 40

#### Map Creation File Size Limitations
- **Large Image Files**: Maps with large file sizes can cause deployment aborts
  - **Symptom**: Dev restart/deployment process fails silently during file upload
  - **Root Cause**: Image files exceeding upload limits during git push operations
  - **Solution**: Compress images or use Discord CDN hosting
  - **Prevention**: Add file size validation in map upload process
  - **Workaround**: Use smaller source images or optimize PNG compression

### Image Processing
- **Memory Usage**: Large images can consume significant memory
  - Solution: Stream processing, image size limits
- **Processing Time**: Complex grids may take time
  - Solution: Async processing, progress indicators
- **Storage**: Processed images need persistent storage
  - Solution: Use CDN, compress images, cleanup old maps

### User Experience
- **Mobile Support**: Ensure map images are mobile-friendly
- **Navigation**: Easy movement between coordinates
- **Visual Feedback**: Clear indication of current location
- **Discovery**: Hints about adjacent areas

## Security & Performance

### Security Measures
1. **Image Validation**
   ```javascript
   const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
   const maxSize = 10 * 1024 * 1024; // 10MB
   
   if (!allowedTypes.includes(attachment.contentType)) {
       throw new Error('Invalid image type');
   }
   if (attachment.size > maxSize) {
       throw new Error('Image too large');
   }
   ```

2. **Rate Limiting**
   - Limit map uploads per user/guild
   - Throttle movement commands
   - Queue channel operations

3. **Permission Checks**
   - Admin-only map creation
   - Validate player access to coordinates
   - Prevent coordinate spoofing

### Performance Optimization
1. **Image Caching**
   - Cache processed grid images
   - Store thumbnails for quick preview
   - CDN integration for fast delivery

2. **Lazy Loading**
   - Create channels on-demand
   - Load coordinate data as needed
   - Paginate large exploration histories

3. **Batch Operations**
   - Group channel creations
   - Bulk permission updates
   - Aggregate database writes

## Future Enhancements

### Advanced Map Features
1. **Dynamic Maps**
   - Time-based changes (day/night)
   - Weather effects
   - Random events

2. **Interactive Elements**
   - Clickable areas within coordinates
   - Mini-games at locations
   - Resource gathering

3. **Social Features**
   - See other players on map
   - Leave messages at coordinates
   - Collaborative objectives

### Integration Possibilities
1. **Safari Shop Integration**
   - Buy map tools (compass, telescope)
   - Unlock new areas with currency
   - Trade discovered items

2. **Combat System**
   - Territory control
   - PvP zones
   - Monster encounters

3. **Quest System**
   - Location-based objectives
   - Treasure hunts
   - Exploration achievements

### Technical Enhancements
1. **AI Integration**
   - Auto-generate location descriptions
   - Dynamic NPC conversations
   - Procedural map generation

2. **3D Visualization**
   - WebGL map preview
   - Interactive 3D exploration
   - VR/AR potential

3. **External Tools**
   - Web-based map editor
   - Mobile companion app
   - Analytics dashboard

---

**Note**: This document is a living specification and will be updated as the feature is developed. For the latest implementation status, refer to the [BACKLOG.md](../BACKLOG.md) and [CLAUDE.md](../CLAUDE.md) files.