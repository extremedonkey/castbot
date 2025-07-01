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
- Players to upload map images to the bot
- Automatic grid overlay and coordinate system generation (A1, B2, C3, etc.)
- Creation of Discord channels for each grid coordinate
- Players exploring the map by moving between grid channels
- Visual feedback showing explored vs unexplored areas

### Core User Flow
1. Admin uploads a map image via Discord
2. Bot processes the image and overlays a grid
3. Bot returns the gridded map to confirm coordinates
4. Bot creates Discord channels for each coordinate
5. Players explore by moving between coordinate channels

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

## Image Upload/Download Methods

### Method 1: Discord Attachment Upload (Recommended)
```javascript
// In slash command or message handler
const attachment = interaction.options.getAttachment('map');
if (attachment.contentType?.startsWith('image/')) {
    const imageBuffer = await fetch(attachment.url).then(res => res.buffer());
    // Process image...
}
```

**Pros:**
- Native Discord functionality
- Familiar to users
- No external hosting needed

**Cons:**
- Discord CDN URLs expire
- Size limitations (8MB for non-Nitro users)

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
            "gridSize": 10,
            "coordinates": {
                "A1": {
                    "channelId": "987654321",
                    "description": "Rocky shores with crashing waves",
                    "items": ["treasure_chest", "compass"],
                    "exploredBy": ["userId1", "userId2"]
                },
                "A2": {
                    "channelId": null, // Not created yet
                    "description": "Dense jungle",
                    "items": [],
                    "exploredBy": []
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

## Implementation Roadmap

### Phase 1: Core Image Processing
1. Implement image upload command
2. Add grid overlay functionality
3. Return processed image to user
4. Store map metadata

### Phase 2: Channel Management
1. Create coordinate channel system
2. Implement movement commands
3. Add permission management
4. Handle channel cleanup

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