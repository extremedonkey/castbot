# Season Lifecycle Management

## Overview

Seasons are the core organizing principle in CastBot. They represent discrete casting periods with distinct phases, players, and outcomes. The active season concept allows the entire server to operate within a shared context.

**Note**: Seasons are stored as `applicationConfigs` in `playerData.json` - this is a legacy naming convention that will eventually be refactored.

## Active Season Concept

### Purpose
The active season serves as the **default context** for all season-related features across the server. Rather than requiring users to select a season for every action, the system maintains a server-wide active season that persists across sessions.

### Storage Structure
```javascript
// In playerData.json at guild level
{
  "1297188286191767603": {  // Guild ID
    "players": { ... },
    "tribes": { ... },
    "applicationConfigs": {  // These ARE the seasons
      "config_1751549410029_391415444084490240": {
        "seasonName": "Season 47: Redemption Island",
        "currentStage": "applications",
        // ... other season data
      }
    },
    "activeSeason": {  // NEW: Tracks currently active season
      "id": "config_1751549410029_391415444084490240",
      "name": "Season 47: Redemption Island",
      "stage": "applications"
    }
  }
}
```

### Setting Active Season
Active season is set through the Production Menu header's "Change Szn" button:
1. User clicks "Change Szn" button in Production Menu header
2. Season selector dropdown appears (powered by `seasonSelector.js`)
3. User selects from existing seasons in `applicationConfigs`
4. System saves selection to `playerData.json` at guild level
5. Production Menu header updates to show season name

### Display Behavior
- **No Active Season**: Header shows "CastBot | Production Menu"
- **Active Season Set**: Header shows "CastBot | [Season Name]"
- Example: "CastBot | Season 47: Redemption Island"

## Season Selector Component

### Reusable Component (`seasonSelector.js`)
The season selector is a **reusable UI component** that pulls seasons from `applicationConfigs`:

```javascript
import { createSeasonSelector } from './seasonSelector.js';

// Create selector that reads from applicationConfigs
const selector = await createSeasonSelector(guildId, {
  customId: 'my_season_select',
  placeholder: 'Select your season...',
  includeCreateNew: true,     // Show "Create New Season" option
  showArchived: false,         // Hide archived seasons
  filterStage: 'applications'  // Only show seasons in specific stage
});
```

### Helper Functions
```javascript
// Get emoji for season stage
getSeasonStageEmoji('applications') // Returns 📝

// Get display name for stage  
getSeasonStageName('voting') // Returns "Voting"
```

## Season Stages

Seasons (stored in `applicationConfigs`) progress through distinct stages:

1. **Planning** 🗓️ - Initial setup and configuration
2. **Applications** 📝 - Accepting player applications
3. **Voting** 🗳️ - Cast voting period
4. **Results** 📊 - Results announcement
5. **Active** ▶️ - Season in progress
6. **Complete** ✅ - Season finished
7. **Archived** 📦 - Historical reference

## Integration Points

### Current Integrations
- **Production Menu**: Shows active season in header
- **Season Applications**: Creates and manages seasons in `applicationConfigs`
- **Change Season Button**: Updates `activeSeason` in playerData

### Future Integrations
- **Castlist System**: Will use active season for default cast selection
- **Safari System**: Tie safari rounds to active season
- **Cast Ranking**: Default to active season's cast
- **Player Stats**: Filter by active season
- **Whisper System**: Season-specific whisper channels

## Data Architecture

### playerData.json Structure
The main storage file contains all server data:
```javascript
{
  "guildId": {
    "players": {},           // Player-specific data (ages, emojis)
    "tribes": {},           // Tribe/role configurations
    "timezones": {},        // Timezone role mappings
    "pronounRoleIDs": [],   // Pronoun role IDs
    "applicationConfigs": {},  // SEASONS (poorly named)
    "activeSeason": {},     // Currently active season reference
    "castlists": {},        // Castlist configurations
    // ... other guild data
  }
}
```

### Why "applicationConfigs"?
Historical context: Originally designed for application management, but evolved into full season management. The name persists for backwards compatibility but conceptually these **ARE** seasons.

## Technical Implementation

### Data Flow
1. **Selection**: User selects season from `applicationConfigs` via dropdown
2. **Storage**: Handler saves reference to `playerData[guildId].activeSeason`
3. **Display**: Menu generation reads `activeSeason` field
4. **Usage**: Features check `playerData[guildId].activeSeason` for context

### Code Example
```javascript
// In castlistMenu.js - Setting active season
playerData[guildId].activeSeason = {
  id: selectedValue,  // References applicationConfigs key
  name: season.seasonName,
  stage: season.currentStage || 'planning'
};
await savePlayerData(playerData);

// In app.js - Reading active season for display
const activeSeason = playerData[guildId]?.activeSeason;
const menuTitle = activeSeason?.name 
  ? `## CastBot | ${activeSeason.name}`
  : `## CastBot | Production Menu`;
```

### Error Handling
- Missing active season: Features use fallback behavior
- Invalid season ID: Check if still exists in `applicationConfigs`
- Deleted season: Clear active season, notify user

## Migration Strategy

### From Manual Selection
Previous approach required selecting season for every action:
```javascript
// OLD: Every feature asks for season
"Select season for castlist..."
"Select season for applications..."
"Select season for rankings..."

// NEW: Use active season by default
const seasonId = playerData[guildId]?.activeSeason?.id;
const season = playerData[guildId]?.applicationConfigs?.[seasonId];
```

### Backwards Compatibility
- Existing `applicationConfigs` remain unchanged
- Active season is optional - features work without it
- Gradual migration as features are updated

## Best Practices

### For Developers
1. **Check active season** before prompting for selection
2. **Validate season exists** in `applicationConfigs`
3. **Handle missing season** gracefully with fallbacks
4. **Update displays** when active season changes

### For Users
1. **Set active season** at start of casting period
2. **Change via header button** when switching seasons
3. **All features** will use this as default context

## Related Documentation
- [Season Applications](../features/SeasonAppBuilder.md) - Creating seasons in applicationConfigs
- [Components V2](../architecture/ComponentsV2.md) - UI component structure
- [Menu System Architecture](../architecture/MenuSystemArchitecture.md) - Menu patterns
- [Castlist V3 Integration](../features/CastlistV3-SeasonIntegration.md) - Season-based castlists