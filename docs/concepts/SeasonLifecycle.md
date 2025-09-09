# Season Lifecycle in CastBot

## Overview

CastBot is designed for managing online reality games (ORGs) - online versions of shows like Survivor and Big Brother. Each game is played in **seasons** lasting 7-40 days, with a complete lifecycle from planning to completion.

## Core Concept: Everything is a Season

In CastBot, nearly every feature revolves around seasons:
- Players **apply** for seasons
- Hosts **cast** players for seasons  
- Players compete in **challenges** during seasons
- **Castlists** track tribes throughout seasons
- **Safari** games run alongside seasons
- **Alumni castlists** preserve season history

The only truly season-independent data is core player information (age, pronouns, timezone).

## Season Lifecycle Stages

Each season progresses through these stages:

### 1. **Planning** 
- Host configures season settings
- Creates application questions
- Sets up Discord channels

### 2. **Applications**
- Players click apply button
- Submit application forms
- Host reviews submissions

### 3. **Cast Review**
- Host ranks applicants
- Reviews player compatibility
- Makes casting decisions

### 4. **Casting Offers**
- Selected players receive invitations
- Players accept/decline offers
- Alternates contacted if needed

### 5. **Pre-Marooning**
- Cast confirmed but not announced
- Behind-scenes preparation
- Tribe assignments planned

### 6. **Starting Phase (Pre-Swap)**
- Players announced and placed in initial tribes
- Castlists created for each tribe
- Game officially begins
- Initial challenges and voting

### 7. **Swap N** (Optional, Repeatable)
- Tribes mixed to create drama
- New castlists generated
- Can happen 0-3 times per season
- Examples: `swap1`, `swap2`, `swap3`

### 8. **Merge**
- Remaining players form single tribe
- Individual gameplay begins
- Final stretch to winner

### 9. **Complete**
- Winner determined
- Season archived
- Alumni castlists created

## Technical Implementation

### Data Structure

Seasons are stored in `playerData.json` under `applicationConfigs` (historical naming):

```javascript
"applicationConfigs": {  // Eventually rename to "seasons"
  "config_1751549410029_391415444084490240": {
    // Core season identity
    "seasonName": "ReeceVivor S15: Island of Secrets",
    "stage": "merge",  // Current lifecycle stage
    
    // Application settings
    "buttonText": "Apply for S15!",
    "channelFormat": "📝%name%-app",
    "questions": [...],
    
    // Linked entities (future)
    "tribes": [],      // Tribe role IDs
    "castlists": [],   // Including alumni
    "safariId": null,  // If using safari
    
    // Metadata
    "createdAt": 1234567890,
    "lastUpdated": 1234567890,
    "archived": false
  }
}
```

### Stage Values

Valid stage values for tracking season progress:
- `planning` - Initial setup
- `applications` - Accepting applications
- `cast_review` - Reviewing applicants
- `casting_offers` - Inviting cast
- `pre_marooning` - Pre-game preparation
- `pre_swap` - Initial game phase
- `swap1`, `swap2`, `swap3` - Tribe swaps
- `merge` - Merged tribe
- `complete` - Season finished

### Stage Emoji Mapping

For UI display:
- 📝 Planning/Applications
- 🎯 Cast Review/Offers
- 🏝️ Pre-Marooning
- 🎮 Pre-Swap (active game)
- 🔄 Swaps
- 🤝 Merge
- 🏆 Complete

## Feature Integration

### Season Applications (`season_management_menu`)
- Creates and manages season configurations
- Sets up application questions
- Tracks application stage

### Castlists (`prod_manage_tribes`)
- Links tribes to seasons
- Tracks tribe evolution through swaps
- Preserves alumni placements

### Safari (`prod_safari_menu`)
- Optional season component
- Can be reused across seasons
- Links to season for context

### Player Data
- Core data (age, pronouns) persists across seasons
- Application responses tied to specific seasons
- Rankings and placements season-specific

## Best Practices

1. **Always Link to Season**: New features should reference season ID
2. **Respect Lifecycle**: Features should check stage before allowing actions
3. **Preserve History**: Never delete season data, use archiving
4. **Track Changes**: Update `lastUpdated` when modifying season data

## Future Enhancements

- Rename `applicationConfigs` to `seasons` for clarity
- Add season templates for quick setup
- Season statistics dashboard
- Automated stage progression
- Multi-server season support

## Related Documentation

- [CastlistV3.md](../features/CastlistV3.md) - Alumni and season-linked castlists
- [SeasonAppBuilder.md](../features/SeasonAppBuilder.md) - Application system
- [Safari.md](../features/Safari.md) - Optional season games