# Safari Map Issues & Roadmap

## Known Issues

### 1. Grid Visual Scaling Problem 🔴 High Priority

**Issue**: Grid parameters (border, line width, font size) are hardcoded regardless of image dimensions.

**Symptoms**:
- Small images (500x500): Oversized text and thick lines
- Large images (3000x3000): Tiny, unreadable labels
- Non-square images: Distorted text placement

**Current Hardcoded Values**:
```javascript
borderSize: 80
lineWidth: 4  
fontSize: 40
```

**Proposed Solution**:
```javascript
function calculateOptimalGridParameters(imageWidth, imageHeight, gridColumns, gridRows) {
  const avgDimension = (imageWidth + imageHeight) / 2;
  const scaleFactor = avgDimension / 1000; // Base: 1000px
  
  return {
    borderSize: Math.round(Math.min(Math.max(avgDimension * 0.08, 40), 200)),
    lineWidth: Math.round(Math.min(Math.max(2 + Math.log2(scaleFactor) * 1.5, 2), 8)),
    fontSize: Math.round(Math.min(Math.max(
      Math.min(imageWidth / gridColumns, imageHeight / gridRows) * 0.15, 
      20
    ), 80))
  };
}
```

**Implementation Status**: 🔄 Planned

### 2. Large Map File Size Issues 🟡 Medium Priority

**Issue**: Large image files can cause deployment failures during git operations.

**Symptoms**:
- Dev restart fails silently with large maps
- Git push aborts due to file size
- Slow image loading in Discord

**Current Workarounds**:
- Use smaller source images
- Compress PNG files before upload
- Consider Discord CDN hosting only

**Proposed Solutions**:
1. Add file size validation (max 10MB)
2. Implement automatic image compression
3. Store only URLs, not actual images
4. Use image optimization library (sharp)

**Implementation Status**: 🔄 Planned

### 3. Channel Limit Restrictions 🟡 Medium Priority

**Issue**: Discord's 500 channel limit restricts very large maps.

**Current Limits**:
- Maximum 400 cells recommended (leaves room for other channels)
- 20x20 maps approach practical limit
- No warning when approaching limit

**Proposed Solutions**:
1. Add channel count warning in UI
2. Implement virtual channels (single channel, multiple states)
3. Dynamic channel creation (create as explored)
4. Multiple category support for huge maps

**Implementation Status**: 🔄 Research Phase

### 4. Permission Sync Issues 🟢 Low Priority

**Issue**: Occasionally players retain access to previous locations.

**Symptoms**:
- Multiple channels visible to player
- Can interact with old location
- Permission cleanup incomplete

**Causes**:
- Network timeouts during permission updates
- Race conditions in movement
- Discord API delays

**Current Workarounds**:
- Admin manual permission reset
- Player rejoin fixes most cases
- Automated cleanup task

**Proposed Solutions**:
1. Add permission verification after movement
2. Implement retry logic for failed updates
3. Periodic permission audit task
4. Add "Fix Permissions" admin button

**Implementation Status**: 🔄 Low Priority

## Limitations

### Technical Limitations

1. **Image Source**: Only Discord CDN URLs accepted (security measure)
2. **Grid Dimensions**: 1-100 per axis, 400 total cells maximum
3. **Movement Schema**: Only adjacent_8 currently implemented
4. **Regeneration Types**: Only full_reset implemented for stamina
5. **Coordinate System**: Limited to 676 columns (AA-ZZ)

### Discord API Limitations

1. **Rate Limits**:
   - Channel creation: 5 per 5 seconds
   - Permission updates: 1000 per 10 minutes
   - Message edits: 5 per second

2. **Size Limits**:
   - Image files: 25MB maximum
   - Embed descriptions: 4096 characters
   - Button labels: 80 characters

### Performance Limitations

1. **Large Maps**: Creation can take 15+ minutes for 400 cells
2. **Fog Generation**: CPU intensive for large grids
3. **File Storage**: Local filesystem dependency
4. **Memory Usage**: Large images consume significant RAM

## Planned Enhancements

### Phase 1: Core Improvements 🚀 Next Release

#### Dynamic Grid Scaling
- **Status**: 🔄 Ready for implementation
- **Effort**: 2-3 hours
- **Impact**: High - fixes major visual issue
- Calculate parameters based on image size
- Support different aspect ratios
- User-configurable overrides

#### Cell Content Editor
- **Status**: 🔄 In progress
- **Effort**: 1-2 days
- **Impact**: High - critical for content creation
- Edit location descriptions via UI
- Manage stores/items per cell
- Preview changes before saving

#### Movement Schemas
- **Status**: 📝 Designed
- **Effort**: 4-6 hours
- **Impact**: Medium - gameplay variety
- cardinal_4: Only N/S/E/W movement
- knight_8: Chess knight L-shaped moves
- teleport: Warp points between locations

### Phase 2: Advanced Features 🎯 Q2 2025

#### Multi-Floor Maps
- **Status**: 💭 Concept
- **Effort**: 1 week
- **Impact**: High - major feature
- Support for Z-axis (floors/levels)
- Stairways and elevators
- Floor-specific content

#### NPC System
- **Status**: 💭 Concept
- **Effort**: 2 weeks
- **Impact**: High - engagement
- Place NPCs at coordinates
- Dialog trees
- Quest giving
- Trading

#### Environmental Effects
- **Status**: 💭 Concept
- **Effort**: 1 week
- **Impact**: Medium - immersion
- Weather system
- Day/night cycles
- Terrain types affect movement
- Hazardous areas

### Phase 3: Social Features 🌟 Q3 2025

#### Multiplayer Visibility
- **Status**: 💭 Concept
- **Effort**: 3-4 days
- **Impact**: High - social engagement
- See other players on map
- Player markers on fog maps
- "Players nearby" indicator

#### Territory Control
- **Status**: 💭 Concept
- **Effort**: 2 weeks
- **Impact**: High - competitive gameplay
- Claim coordinates
- Guild territories
- Resource generation
- PvP zones

#### Collaborative Exploration
- **Status**: 💭 Concept
- **Effort**: 1 week
- **Impact**: Medium - teamwork
- Party system
- Shared visibility
- Group challenges
- Combined stamina pools

## Future Architecture Changes

### Proposed Module Separation
```
mapCore.js          - Core map operations
mapRenderer.js      - Image processing and grid generation
mapChannels.js      - Discord channel management
mapContent.js       - Location content management
mapMovement.js      - Movement and navigation (existing)
mapPermissions.js   - Permission management
mapAnalytics.js     - Usage tracking and statistics
```

### Database Migration
- Move from JSON files to database
- Better concurrent access
- Improved query performance
- Backup and recovery options

### Caching Layer
- Redis for coordinate data
- CDN for map images
- Memory cache for active players
- Distributed cache for scaling

## Testing Requirements

### Critical Test Scenarios

1. **Edge Cases**:
   - 1x1 maps (no movement possible)
   - 100x100 maps (maximum size)
   - 1x100 maps (extreme aspect ratio)
   - Rapid movement commands
   - Simultaneous player movements

2. **Failure Modes**:
   - Channel creation interruption
   - Permission update failures
   - Image processing errors
   - Stamina depletion edge cases
   - Network timeout handling

3. **Performance Tests**:
   - 50+ concurrent players
   - 400 cell map creation
   - Rapid navigation spam
   - Large image processing
   - Memory leak detection

## Migration Guide

### From Legacy System
1. No hardcoded maps remain (all retired)
2. Export any custom content
3. Recreate maps with new system
4. Migrate player progress manually

### Version Compatibility
- v1.0: Original 7x7 fixed maps
- v2.0: Dynamic dimensions (current)
- v3.0: Multi-floor support (planned)

### Breaking Changes
- Coordinate system change for wide maps
- Button ID pattern changes
- Data structure migrations

## Support & Troubleshooting

### Debug Commands
```javascript
// Check player permissions
/safari debug permissions @player

// Verify map integrity
/safari debug map

// Reset player location
/safari admin reset @player

// Regenerate fog maps
/safari admin regenerate-fog
```

### Common Fixes
1. **Player stuck**: Admin move to valid location
2. **Missing channels**: Regenerate map
3. **Broken permissions**: Manual reset required
4. **Corrupt data**: Restore from backup

### Monitoring
- Track channel creation success rate
- Monitor permission update failures
- Log movement patterns
- Measure stamina depletion rates

---

For user documentation, see [Safari Map System Guide](SafariMapSystem.md).
For technical details, see [Safari Map Technical Reference](SafariMapTechnical.md).