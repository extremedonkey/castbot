# CastlistV3 Season Integration Design

## Overview

This document outlines the integration of the season concept from SeasonAppBuilder into CastlistV3 Alumni Placements, addressing subtitle support, deletion cascades, and bidirectional season creation.

## Key Requirements

### 1. Subtitle Support ✅
**Current Status**: ALREADY SUPPORTED
- Seasons use `seasonName` field, not numbers
- Examples: "LOSTvivor S2: We've got to go back", "Zeldavivor: Ancient Legends"
- No changes needed - the existing structure handles any text format

### 2. Season Deletion Handling
**Problem**: Discord select menus have 25-item limit
**Solution**: Soft-delete pattern with cleanup options

```javascript
// In playerData.json - seasons get archived, not deleted
"seasons": {
  "season_abc123": {
    "name": "LOSTvivor S2: We've got to go back",
    "archived": true,  // Soft delete flag
    "archivedAt": 1757335255059,
    "linkedTribes": ["tribe_id_1", "tribe_id_2"]  // Track dependencies
  }
}
```

**Cascade Behavior**:
1. Mark season as archived (soft delete)
2. Keep tribe associations intact (no data loss)
3. Hide from active select menus
4. Provide "View Archived Seasons" option
5. Allow permanent deletion with confirmation

### 3. Bidirectional Season Creation
**Goal**: Alumni castlists can create seasons visible in season_management_menu

## Implementation Design

### Phase 1: Add Season Linking to Tribes (Soft-Link Pattern)

```javascript
// Modified tribe structure in playerData.json
"tribes": {
  "1409191262279700622": {
    "emoji": "🏆",
    "castlist": "LOSTvivor Alumni",
    "type": "alumni_placements",
    "seasonId": "season_abc123",  // NEW: Optional season link
    "seasonName": "LOSTvivor S2: We've got to go back",  // NEW: Display name
    "rankings": {
      "977455730300956683": { "placement": "1" },
      "572291395365109770": { "placement": "2" },
      "391415444084490240": { "placement": "3" }
    }
  }
}
```

### Phase 2: Season Management Structure

```javascript
// Centralized season registry in playerData.json
"seasons": {
  "season_abc123": {
    "id": "season_abc123",
    "name": "LOSTvivor S2: We've got to go back",
    "createdAt": 1757335255059,
    "createdBy": "391415444084490240",
    "source": "alumni_castlist",  // or "application_builder"
    "archived": false,
    "linkedEntities": {
      "applicationConfigs": ["config_id_1"],
      "tribes": ["tribe_id_1", "tribe_id_2"],
      "castRankings": ["ranking_id_1"]
    }
  }
}
```

### Phase 3: UI Integration

#### A. Alumni Castlist Creation Modal
```javascript
// When creating alumni placement castlist
const modal = {
  title: 'Create Alumni Castlist',
  components: [
    {
      type: 1,
      components: [{
        type: 4,  // Text input
        custom_id: 'tribe_emoji',
        label: 'Tribe Emoji (optional)',
        style: 1,
        required: false
      }]
    },
    {
      type: 1,
      components: [{
        type: 4,
        custom_id: 'season_select',
        label: 'Season (optional)',
        placeholder: 'Select existing or create new',
        style: 1,
        required: false
      }]
    },
    {
      type: 1,
      components: [{
        type: 4,
        custom_id: 'new_season_name',
        label: 'Or Create New Season',
        placeholder: 'e.g., LOSTvivor S3: The Island Strikes Back',
        style: 1,
        required: false
      }]
    },
    // ... placement fields
  ]
};
```

#### B. Season Management Menu Enhancement
```javascript
// In season_management_menu handler
const seasons = await getAllSeasons(guildId);
const activeSeasons = seasons.filter(s => !s.archived);
const archivedSeasons = seasons.filter(s => s.archived);

// Show all active seasons (from both sources)
const seasonOptions = activeSeasons.map(season => ({
  label: season.name.substring(0, 100),
  value: season.id,
  description: `Created from ${season.source === 'alumni_castlist' ? 'Alumni Castlist' : 'Application Builder'}`,
  emoji: season.source === 'alumni_castlist' ? '🏆' : '📝'
}));

// Handle 25-item limit with pagination or archiving
if (seasonOptions.length >= 20) {
  seasonOptions.push({
    label: 'View Archived Seasons',
    value: 'view_archived',
    description: `${archivedSeasons.length} archived seasons`,
    emoji: '📦'
  });
}
```

### Phase 4: Migration Strategy

```javascript
// One-time migration to unify seasons
async function migrateToUnifiedSeasons(guildId) {
  const playerData = await loadPlayerData();
  const guildData = playerData[guildId] || {};
  
  // Initialize seasons registry
  if (!guildData.seasons) {
    guildData.seasons = {};
  }
  
  // Migrate from applicationConfigs
  const configs = guildData.applicationConfigs || {};
  for (const [configId, config] of Object.entries(configs)) {
    if (config.seasonId && !guildData.seasons[config.seasonId]) {
      guildData.seasons[config.seasonId] = {
        id: config.seasonId,
        name: config.seasonName,
        source: 'application_builder',
        createdAt: Date.now(),
        archived: false,
        linkedEntities: {
          applicationConfigs: [configId],
          tribes: [],
          castRankings: []
        }
      };
    }
  }
  
  // Future: Migrate alumni castlists when they get seasonId
  
  await savePlayerData(playerData);
}
```

## Implementation Steps

### Step 1: Core Season Registry (2 hours)
```javascript
// storage.js - Add season management functions
export async function createSeason(guildId, seasonData) {
  const playerData = await loadPlayerData();
  const guildData = playerData[guildId] || {};
  
  if (!guildData.seasons) {
    guildData.seasons = {};
  }
  
  const seasonId = `season_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  guildData.seasons[seasonId] = {
    id: seasonId,
    name: seasonData.name,
    createdAt: Date.now(),
    createdBy: seasonData.userId,
    source: seasonData.source || 'manual',
    archived: false,
    linkedEntities: {
      applicationConfigs: [],
      tribes: [],
      castRankings: []
    }
  };
  
  await savePlayerData(playerData);
  return seasonId;
}

export async function linkSeasonToEntity(guildId, seasonId, entityType, entityId) {
  const playerData = await loadPlayerData();
  const season = playerData[guildId]?.seasons?.[seasonId];
  
  if (season && season.linkedEntities[entityType]) {
    if (!season.linkedEntities[entityType].includes(entityId)) {
      season.linkedEntities[entityType].push(entityId);
      await savePlayerData(playerData);
    }
  }
}

export async function archiveSeason(guildId, seasonId) {
  const playerData = await loadPlayerData();
  const season = playerData[guildId]?.seasons?.[seasonId];
  
  if (season) {
    season.archived = true;
    season.archivedAt = Date.now();
    await savePlayerData(playerData);
  }
}
```

### Step 2: Modify Alumni Castlist Creation (1 hour)
```javascript
// In app.js - tribe_add_modal handler
if (tribeType === 'alumni_placements') {
  const seasonSelection = components[4]?.components[0]?.value;
  const newSeasonName = components[5]?.components[0]?.value;
  
  let seasonId = null;
  let seasonName = null;
  
  if (newSeasonName) {
    // Create new season
    seasonId = await createSeason(guildId, {
      name: newSeasonName,
      userId: userId,
      source: 'alumni_castlist'
    });
    seasonName = newSeasonName;
  } else if (seasonSelection && seasonSelection !== 'none') {
    // Link to existing season
    seasonId = seasonSelection;
    const seasons = await getAllSeasons(guildId);
    seasonName = seasons.find(s => s.id === seasonId)?.name;
  }
  
  // Save tribe with season info
  tribeData = {
    roleId: targetRole,
    emoji: tribeEmoji || null,
    castlist: castlistType,
    type: 'alumni_placements',
    seasonId: seasonId,
    seasonName: seasonName,
    rankings: rankings
  };
  
  // Link season to tribe
  if (seasonId) {
    await linkSeasonToEntity(guildId, seasonId, 'tribes', targetRole);
  }
}
```

### Step 3: Season Select Component (1 hour)
```javascript
// Create reusable season selector
async function createSeasonSelect(guildId, includeCreateNew = true) {
  const seasons = await getAllSeasons(guildId);
  const activeSeasons = seasons.filter(s => !s.archived);
  
  const options = [
    {
      label: 'No Season Association',
      value: 'none',
      description: 'Standalone castlist'
    }
  ];
  
  // Add existing seasons (limit to 23 to leave room for options)
  const seasonOptions = activeSeasons.slice(0, 23).map(season => ({
    label: season.name.substring(0, 100),
    value: season.id,
    description: `From ${season.source === 'alumni_castlist' ? 'Alumni' : 'Applications'}`,
    emoji: season.source === 'alumni_castlist' ? '🏆' : '📝'
  }));
  
  options.push(...seasonOptions);
  
  if (includeCreateNew) {
    options.push({
      label: 'Create New Season',
      value: 'create_new',
      description: 'Define a new season',
      emoji: '➕'
    });
  }
  
  return {
    type: 3,  // String select
    custom_id: 'season_select',
    placeholder: 'Select a season',
    options: options
  };
}
```

### Step 4: Display Season in Castlist (30 min)
```javascript
// In castlistV2.js - Add season info to display
if (tribeData.seasonName) {
  const seasonBadge = ` 📅 ${tribeData.seasonName}`;
  // Add to castlist header or footer
  castlistContent = `${castlistContent}\n\n${seasonBadge}`;
}
```

### Step 5: Season Deletion Handler (1 hour)
```javascript
// In app.js - Add season archive handler
} else if (custom_id === 'season_archive') {
  const seasonId = req.body.data.values[0];
  
  // Check dependencies
  const season = await getSeason(guildId, seasonId);
  const dependencies = [];
  
  if (season.linkedEntities.applicationConfigs.length > 0) {
    dependencies.push(`${season.linkedEntities.applicationConfigs.length} application configs`);
  }
  if (season.linkedEntities.tribes.length > 0) {
    dependencies.push(`${season.linkedEntities.tribes.length} castlist tribes`);
  }
  
  if (dependencies.length > 0) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `⚠️ **Cannot delete season "${season.name}"**\n\nThis season is linked to:\n• ${dependencies.join('\n• ')}\n\nRemove these associations before deleting the season.`,
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
  
  // Archive the season
  await archiveSeason(guildId, seasonId);
  
  return res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: await createSeasonManagementUI(guildId)
  });
}
```

## Benefits

### 1. **Unified Season Management**
- Single source of truth for all seasons
- Consistent naming across features
- Easy to find all content for a season

### 2. **Flexible Architecture**
- Supports any naming convention (numbers, subtitles, themes)
- Optional linking (backwards compatible)
- Gradual adoption possible

### 3. **Scalability**
- Handles 25+ seasons via archiving
- Efficient dependency tracking
- Clean deletion with cascade checks

### 4. **User Experience**
- Create seasons from any feature
- See all season content in one place
- Preserve data even when archiving

## Migration Path

### Phase 1: Deploy Core (No Breaking Changes)
1. Add season registry to storage.js
2. Add season fields to tribes
3. Deploy without requiring changes

### Phase 2: Enable Creation (Opt-in)
1. Add season selector to alumni castlist modal
2. Allow creating new seasons
3. Display season info in castlists

### Phase 3: Unify Existing (One-time)
1. Run migration to create season registry
2. Link existing configs and tribes
3. Enable season management menu updates

### Phase 4: Advanced Features
1. Season statistics dashboard
2. Bulk season operations
3. Season templates and cloning

## Testing Checklist

- [ ] Create alumni castlist without season (backwards compatible)
- [ ] Create alumni castlist with existing season
- [ ] Create alumni castlist with new season
- [ ] View season in season_management_menu
- [ ] Archive season with no dependencies
- [ ] Attempt to archive season with dependencies (should fail)
- [ ] Display season info in castlist
- [ ] Handle 25+ seasons (pagination/archiving)
- [ ] Migrate existing data without breaking

## Conclusion

This design provides a robust, scalable solution for integrating seasons across CastBot features while maintaining backwards compatibility and supporting all naming conventions servers might use. The soft-linking pattern allows gradual adoption without forcing immediate changes to existing functionality.