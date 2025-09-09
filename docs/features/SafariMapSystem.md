# Safari Map System - User & Admin Guide

## Overview

The Safari Map System transforms Discord into an interactive grid-based exploration system where players physically move between Discord channels representing map coordinates. Admins upload custom images, define grid dimensions, and create immersive exploration experiences.

## Current Capabilities (January 2025)

### Map Features
- **Custom Images**: Upload any Discord CDN image URL as your map
- **Flexible Grid Sizes**: Support for 1x1 to 100x100 grids (max 400 total cells)
- **Non-Square Maps**: Full support for rectangular grids (e.g., 3x1, 5x10, 20x5)
- **Dynamic Updates**: Replace map images without losing player progress or data
- **Fog of War**: Players only see their current location, other areas remain hidden

### Movement System
- **8-Directional Movement**: Move in cardinal and diagonal directions
- **Stamina-Based**: Each move costs 1 stamina point (default)
- **Stamina Regeneration**: Full reset every 12 hours (configurable)
- **Permission Management**: Automatic Discord channel access control
- **Navigate Button Pattern**: Clean ephemeral UI for movement selection

### Content Features
- **Location Stores**: Attach Safari stores to specific coordinates
- **Item Drops**: Place collectible items at locations
- **Currency Drops**: Hidden currency rewards at coordinates
- **Custom Actions**: Location-specific Safari buttons and interactions

## Player Experience

### Getting Started
1. **Join the Adventure**: Click "Start Exploring" in `/menu` → Map Explorer
2. **Initial Placement**: System places you at starting coordinate (default: A1)
3. **Navigation**: Click the Navigate button to see movement options
4. **Movement**: Select a direction to move (costs 1 stamina)
5. **Exploration**: Discover new locations, items, and stores

### Movement Interface
When you click Navigate, you see:
```
↖️ NW     ⬆️ North   ↗️ NE
⬅️ West   📍 C3      ➡️ East  
↙️ SW     ⬇️ South   ↘️ SE
```
- Greyed out buttons = invalid moves (map edge or no stamina)
- 🚫 buttons = blacklisted/restricted locations

### Stamina Management
- **Current/Max Display**: "⚡ Stamina: 8/10"
- **Movement Cost**: 1 point per move (default)
- **Regeneration**: Full reset every 12 hours
- **Out of Stamina**: "You're too tired to move! Rest for X hours"

### Location Features
At each coordinate you may find:
- **Stores**: Grey buttons to browse location-specific shops
- **Item Drops**: Colored buttons to collect items
- **Currency**: Hidden rewards discovered through exploration
- **Descriptions**: Rich text describing the location

## Admin Guide

### Creating a Map

#### Step 1: Prepare Your Image
1. Upload your map image to any Discord channel
2. Right-click the image → "Copy Link"
3. Ensure URL starts with `https://cdn.discordapp.com/attachments/`

#### Step 2: Create the Map
1. Navigate to `/menu` → Production Menu → Safari → Map Explorer
2. Click "Create/Update Map"
3. Enter:
   - **Discord Image URL**: The CDN link you copied
   - **Number of Columns**: 1-100 (width)
   - **Number of Rows**: 1-100 (height)
4. Click Submit

#### Step 3: Map Generation Process
The system will:
1. Download and process your image
2. Overlay a grid with coordinate labels
3. Create Discord channels (#a1, #b2, etc.)
4. Generate fog of war versions for each location
5. Post anchor messages with navigation buttons

**Note**: Channel creation may take several minutes for large maps due to Discord rate limits (5 channels per 5 seconds).

### Map Dimensions Guide

#### Minimum Viable Maps
- **1x1**: Single location (testing, special events)
- **1x3 or 3x1**: Linear path adventure
- **2x2**: Minimal exploration (4 locations)

#### Standard Maps
- **5x5**: Small adventure (25 locations)
- **7x7**: Medium adventure (49 locations)
- **10x10**: Large adventure (100 locations)

#### Specialized Maps
- **20x5**: Wide horizontal exploration
- **5x20**: Tall vertical journey
- **15x15**: Maximum balanced map (225 locations)

### Managing Maps

#### Update Map Image
1. Click "Create/Update Map" with existing map
2. Provide new image URL
3. System replaces image while preserving:
   - Player locations
   - Channel structure
   - Content configuration

#### Delete Map
1. Click "Delete Map" button
2. Confirm deletion (cannot be undone)
3. System removes:
   - All coordinate channels
   - Map category
   - Image files
   - Player progress data

### Player Management

#### View Player Locations
1. Safari Menu → Map Admin → Player Locations
2. Shows all players and their current coordinates
3. Includes last movement time and explored areas

#### Move Players
1. Safari Menu → Map Admin → Move Player
2. Select player and target coordinate
3. Options:
   - Normal move (consumes stamina)
   - Admin move (bypasses stamina)

#### Reset Player Progress
1. Safari Menu → Map Admin → Reset Player
2. Clears exploration history
3. Returns player to starting position

### Adding Location Content

#### Attach Stores
1. Navigate to target coordinate channel
2. Click "Location Actions" → "🏪 Add Store"
3. Select stores from multi-select menu
4. Stores appear as grey buttons at location

#### Add Item Drops
1. Click "Location Actions" → "🧰 Add Item"
2. Configure:
   - Item to drop
   - Button text and style
   - Drop type (per player/per season)
3. Item appears as colored button

#### Add Currency Drops
1. Click "Location Actions" → "💰 Add Currency"
2. Set amount and currency type
3. Configure button appearance
4. Currency hidden until collected

### Access Control

#### Blacklist Coordinates
1. Safari Menu → Map Admin → Blacklist
2. Enter coordinates to restrict (comma-separated)
3. Blacklisted locations show 🚫 in navigation

#### Manage Permissions
- Players can only see their current location
- Previous locations become inaccessible
- Admin bypass available for testing

## Troubleshooting

### Common Issues

#### "This interaction failed" on Movement
- **Cause**: Stale navigation button (player already moved)
- **Solution**: Use new Navigate button in current channel

#### Player Stuck/Can't Move
- **Check**: Stamina level (may be 0)
- **Check**: Valid moves available (not at edge)
- **Solution**: Admin move or wait for regeneration

#### Map Creation Stalls
- **Cause**: Discord rate limiting
- **Normal**: 5 channels per 5 seconds
- **Large maps**: Can take 10+ minutes

#### Fog Maps Not Showing
- **Check**: Image file exists in `/img/{guildId}/`
- **Solution**: Regenerate with Update Map

### Permission Issues

#### Player Can't See Channel
- **Verify**: Player is at that coordinate
- **Check**: Channel permissions
- **Fix**: Admin move player away and back

#### Multiple Channels Visible
- **Cause**: Permission cleanup failed
- **Fix**: Manual permission reset
- **Prevention**: Ensure proper movement flow

## Best Practices

### Map Design
- **Start Small**: Test with 3x3 or 5x5 maps
- **Clear Paths**: Ensure players can reach all areas
- **Strategic Blacklists**: Create maze-like experiences
- **Balanced Content**: Distribute rewards evenly

### Content Distribution
- **Early Rewards**: Place easy items near start
- **Progressive Difficulty**: Harder content further out
- **Hidden Secrets**: Reward thorough exploration
- **Store Placement**: Strategic locations for supplies

### Player Experience
- **Clear Descriptions**: Rich location narratives
- **Consistent Theme**: Unified adventure feel
- **Balanced Stamina**: Not too restrictive
- **Regular Events**: Time-limited content

## Examples

### Linear Adventure (1x5)
```
A1 (Start) → A2 (Challenge) → A3 (Store) → A4 (Boss) → A5 (Reward)
```

### Small Exploration (3x3)
```
A1 -- B1 -- C1
|     |     |
A2 -- B2 -- C2
|     |     |
A3 -- B3 -- C3
```
- B2: Central hub with main store
- Corners: Hidden rewards
- Edges: Exploration challenges

### Maze Map (5x5 with Blacklists)
- Blacklist strategic coordinates
- Create winding path
- Hide shortcuts for clever players
- Reward complete exploration

---

For technical implementation details, see [Safari Map Technical Reference](SafariMapTechnical.md).
For known issues and roadmap, see [Safari Map Issues & Roadmap](SafariMapIssues.md).