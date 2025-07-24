# Safari System Documentation Index

## Overview

The Safari system is CastBot's comprehensive interactive content framework for Discord-based Online Reality Games (ORGs). It provides dynamic adventures, resource management, exploration mechanics, and customizable gameplay elements.

## Core Documentation

### 🦁 Main Safari System
**[Safari.md](../Safari.md)** - Complete Safari system documentation
- Core concepts and architecture
- Button system and actions
- Currency and inventory management
- Store and item systems
- Combat mechanics
- Round-based gameplay

### 🗺️ Map Explorer System
**[SafariMapExplorer.md](../SafariMapExplorer.md)** - Grid-based map exploration
- Map creation and management
- Grid overlay system
- Channel-based exploration
- Cell content management
- Player movement mechanics

### ⚡ Points & Resource System
**[SafariPoints.md](../SafariPoints.md)** - Resource management and limitations
- Points/limiter architecture
- Stamina and regeneration
- HP and combat resources
- Custom resource types
- Regeneration patterns

### 🚶 Movement System
**[SafariMapMovement.md](../SafariMapMovement.md)** - Player movement and permissions
- Movement mechanics
- Stamina-based limitations
- Channel permission management
- Exploration tracking
- Movement validation

## Implementation Guides

### 🚀 Initialization System
**[SAFARI_INITIALIZATION_GUIDE.md](SAFARI_INITIALIZATION_GUIDE.md)** - Production deployment
- Initialization procedures
- Data structure setup
- Migration strategies
- Error recovery
- Production scripts

**[SAFARI_INITIALIZATION_SUMMARY.md](SAFARI_INITIALIZATION_SUMMARY.md)** - Implementation summary
- Quick reference
- Key functions
- Deployment options

### 📝 Early Implementation Notes
**[Safari-EarlyPrompt.md](Safari-EarlyPrompt.md)** - Custom terms implementation
- Customization system
- Term replacement
- UI integration
- Future enhancements

### 🔀 Conditional Logic System
**[SafariConditionalLogicPlan.md](../../implementation/SafariConditionalLogicPlan.md)** - Complete redesign plan
- Visual condition builder
- AND/OR logic support
- Currency/Item/Role conditions
- Implementation strategy

**[ConditionalLogicImplementation.md](../../implementation/ConditionalLogicImplementation.md)** - Technical implementation guide
- Button registration
- UI components
- Evaluation engine
- Migration approach

## Safari System Architecture

### Data Structure
```javascript
// safariContent.json
{
  "guildId": {
    "buttons": {},      // Custom Safari buttons
    "safaris": {},      // Safari instances (legacy)
    "applications": {}, // Application data (legacy)
    "stores": {},       // Safari stores
    "items": {},        // Safari items
    "safariConfig": {   // Customization
      "currencyName": "coins",
      "inventoryName": "Inventory",
      "currencyEmoji": "🪙"
    },
    "maps": {},         // Map Explorer data
    "roundHistory": [], // Round results
    "attackQueue": {}   // Combat queue
  }
}
```

### Key Components

1. **Safari Manager** (`safariManager.js`)
   - Core Safari functionality
   - Button creation and management
   - Action processing
   - Currency operations

2. **Entity Management** (see [EntityEditFramework.md](../../architecture/EntityEditFramework.md))
   - Universal CRUD operations
   - UI generation
   - Field editing
   - Validation

3. **Map System** (`mapExplorer.js`)
   - Grid generation
   - Channel management
   - Movement logic
   - Cell content

4. **Points System** (`pointsManager.js`)
   - Resource tracking
   - Regeneration logic
   - Limit enforcement
   - Custom points

## Common Use Cases

### Creating a Safari Adventure
1. Design map layout and grid size
2. Create Safari buttons for interactions
3. Set up stores with items
4. Configure currency and terms
5. Implement movement limitations
6. Add combat/challenges

### Managing Resources
1. Define point types (stamina, HP, etc.)
2. Set regeneration patterns
3. Create consumption rules
4. Track player progress
5. Implement rewards

### Building Interactive Content
1. Create conditional buttons (see [Conditional Logic](../../implementation/SafariConditionalLogicPlan.md))
2. Chain actions together
3. Add random outcomes
4. Implement item effects
5. Design player choices

## Best Practices

1. **Start Simple**: Begin with basic buttons before complex systems
2. **Test Incrementally**: Test each component before combining
3. **Use Limits**: Implement appropriate resource limitations
4. **Plan Content**: Design the full experience before building
5. **Document Custom Terms**: Keep track of customizations
6. **Monitor Performance**: Watch for channel/API limits

## Future Enhancements

- Advanced combat system
- Team-based exploration
- Procedural map generation
- AI-driven NPCs
- Cross-server adventures
- Achievement system
- Leaderboards
- Season mechanics

## Related Systems

- [Season Applications](../SeasonAppBuilder.md) - Application management
- [Components V2](../../architecture/ComponentsV2.md) - UI architecture
- [Button Factory](../../architecture/ButtonHandlerFactory.md) - Button patterns
- [Entity Framework](../../architecture/EntityEditFramework.md) - Content management