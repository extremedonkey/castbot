# Safari Points System Documentation

## Overview

The Safari Points System is a flexible resource management framework that governs player actions and interactions within the Safari ecosystem. It provides configurable "points" (stamina, HP, mana, etc.) that limit and pace player activities, creating strategic gameplay decisions and preventing content rushing.

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Architecture](#architecture)
3. [Point Types](#point-types)
4. [Regeneration Systems](#regeneration-systems)
5. [Integration with Safari Actions](#integration-with-safari-actions)
6. [Admin Management](#admin-management)
7. [Implementation Details](#implementation-details)
8. [Configuration](#configuration)
9. [Future Enhancements](#future-enhancements)

## Core Concepts

### What are Points?

Points are numerical resources that:
- **Limit Actions**: Players must spend points to perform certain actions
- **Regenerate Over Time**: Points recover based on configured patterns
- **Create Strategy**: Force players to make meaningful choices
- **Pace Content**: Prevent players from completing content too quickly

### Entity-Agnostic Design

The system supports points for any entity type:
- **Players**: `player_391415444084490240`
- **NPCs**: `npc_forest_guardian` (future)
- **Items**: `item_health_potion` (future)
- **Locations**: `location_ancient_shrine` (future)

## Architecture

### File Structure
```
/castbot
├── pointsManager.js      # Core points logic and configuration
├── safariManager.js      # Integration with Safari actions
├── safariContent.json    # Points data storage
├── playerData.json       # Legacy player stamina storage
└── mapMovement.js        # Movement system using points
```

### Data Storage

Points are stored in two locations:

1. **safariContent.json** (Entity Points System):
```json
{
  "guildId": {
    "entityPoints": {
      "player_391415444084490240": {
        "stamina": {
          "current": 1,
          "max": 1,
          "lastRegeneration": 1754313989646,
          "lastUse": 1754313989646
        }
      }
    }
  }
}
```

2. **playerData.json** (Legacy System - still in use):
```json
{
  "guildId": {
    "players": {
      "userId": {
        "safari": {
          "points": {
            "stamina": {
              "current": 1,
              "maximum": 1,  // Note: uses "maximum" not "max"
              "lastRegeneration": "2025-08-04T13:22:16.559Z",
              "regenConfig": "hourly"
            }
          }
        }
      }
    }
  }
}
```

### ⚠️ Important: Field Name Differences

- **safariContent.json** uses `max` for the maximum value
- **playerData.json** uses `maximum` for the maximum value
- When accessing stamina from playerData, use `stamina.maximum`
- When accessing stamina from entityPoints, use `stamina.max`

## Configuration

### Central Configuration (pointsManager.js)

The stamina configuration is centralized in `pointsManager.js` in the `getDefaultPointsConfig()` function:

```javascript
function getDefaultPointsConfig() {
    return {
        stamina: {
            displayName: "Stamina",
            emoji: "⚡",
            defaultMax: 1,              // Maximum stamina points
            defaultMin: 0,              // Minimum stamina points
            regeneration: {
                type: "full_reset",     // Regeneration type
                interval: 180000,       // 3 minutes (in milliseconds)
                amount: "max"           // Reset to maximum
            },
            visibility: "hidden"        // UI display mode
        }
    };
}
```

### Key Configuration Values

- **Default Maximum**: `1` stamina point
- **Regeneration Time**: `180000ms` (3 minutes)
- **Regeneration Type**: `full_reset` - stamina fully resets after 3 minutes of not being used
- **Movement Cost**: 1 stamina per move (configured elsewhere)

## Point Types

### Stamina (Current Implementation)
- **Purpose**: Limits map movement
- **Default Max**: 1 point (configurable in pointsManager.js)
- **Cost**: 1 point per map movement
- **Regeneration**: Full reset every 3 minutes

### Future Point Types
- **Hit Points (HP)**: Combat and survival
- **Mana**: Magical abilities and special actions
- **Action Points**: General-purpose activity limiter
- **Custom Points**: Server-specific resources

## Regeneration Systems

### 1. Full Reset (MVP Default)
```javascript
{
  "type": "full_reset",
  "interval": 43200000,  // 12 hours
  "amount": "max"
}
```
- Points reset to maximum after interval since last use
- Simple and predictable for players
- Used for stamina in movement system

### 2. Incremental Recovery
```javascript
{
  "type": "incremental",
  "interval": 7200000,  // 2 hours
  "amount": 5
}
```
- Gain fixed amount every interval
- Allows partial recovery
- Good for HP systems

### 3. Future Regeneration Types
- **Percentage-based**: Recover % of max
- **Conditional**: Only regenerate under certain conditions
- **Scheduled**: Reset at specific server times

## Integration with Safari Actions

### New Action Types

#### CHECK_POINTS
Validates if entity has required points:
```javascript
{
  "type": "check_points",
  "config": {
    "pointType": "stamina",
    "amount": 2,
    "failureMessage": "You need to rest for {time}!"
  }
}
```

#### MODIFY_POINTS
Add or subtract points:
```javascript
{
  "type": "modify_points",
  "config": {
    "pointType": "mana",
    "amount": -5,  // Negative to use points
    "successMessage": "Spell cast! Mana: {current}/{max}"
  }
}
```

#### MOVE_PLAYER
Special action for map movement:
```javascript
{
  "type": "move_player",
  "config": {
    "coordinate": "B3"
  }
}
```

### New Condition Types

#### POINTS_GTE / POINTS_LTE
Check point thresholds:
```javascript
{
  "type": "points_gte",
  "pointType": "stamina",
  "value": 5
}
```

#### CAN_MOVE
Check if player has stamina for movement:
```javascript
{
  "type": "can_move"
}
```

#### AT_LOCATION
Check player's current map position:
```javascript
{
  "type": "at_location",
  "coordinate": "D4"
}
```

## Admin Management

### Initialize Points
```javascript
await initializeEntityPoints(guildId, entityId, ['stamina', 'hp']);
```

### Set Points Directly
```javascript
await setEntityPoints(guildId, entityId, 'stamina', 10, 15); // current, max
```

### Check Points
```javascript
const points = await getEntityPoints(guildId, entityId, 'stamina');
// Returns: { current: 8, max: 10, lastRegeneration: ..., lastUse: ... }
```

### Display Points
```javascript
const display = await getPointsDisplay(guildId, entityId, 'stamina');
// Returns: { canUse: true, display: "⚡ 8/10 Energy" }
```

## Implementation Details

### On-Demand Regeneration

The system uses **on-demand calculation** instead of background timers:

1. When points are accessed, calculate time elapsed
2. Apply regeneration based on elapsed time
3. Update timestamps
4. Return current points

**Benefits:**
- No background processes
- No server maintenance
- Scales infinitely
- Timezone-safe (UTC timestamps)

### Timezone Safety

All timestamps use UTC milliseconds:
```javascript
const now = Date.now();  // Always UTC
const elapsed = now - pointData.lastUse;
```

### Performance Optimization

- Points only calculated for active players
- No constant database updates
- Efficient caching within requests
- Minimal computational overhead

## Configuration

### Server-Level Configuration
```javascript
await initializePointsConfig(guildId, {
  stamina: {
    displayName: "Adventure Points",
    emoji: "🥾",
    defaultMax: 20,
    regeneration: {
      type: "incremental",
      interval: 3600000,  // 1 hour
      amount: 2
    }
  }
});
```

### Custom Terminology
Integrate with Safari's custom terms system:
- Rename "stamina" to match server theme
- Custom emojis and display formats
- Localized messages

## Making Stamina Configurable

### Current State
- Stamina max is hard-coded to `1` in `getDefaultPointsConfig()`
- Regeneration interval is hard-coded to `180000ms` (3 minutes)
- All servers use the same configuration

### Future Enhancement: Per-Server Configuration

To make stamina configurable per server:

1. **Modify getDefaultPointsConfig()** to check for server-specific settings:
```javascript
export function getDefaultPointsConfig(guildId = null) {
    // Check for guild-specific config first
    if (guildId) {
        const guildConfig = getGuildStaminaConfig(guildId);
        if (guildConfig) return guildConfig;
    }
    
    // Fall back to defaults
    return {
        stamina: {
            displayName: "Stamina",
            emoji: "⚡",
            defaultMax: 1,
            defaultMin: 0,
            regeneration: {
                type: "full_reset",
                interval: 180000, // 3 minutes
                amount: "max"
            },
            visibility: "hidden"
        }
    };
}
```

2. **Store server configurations** in safariContent.json:
```json
{
  "guildId": {
    "pointsConfig": {
      "stamina": {
        "defaultMax": 5,
        "regeneration": {
          "interval": 600000  // 10 minutes
        }
      }
    }
  }
}
```

## Future Enhancements

### Advanced Features
1. **Multiple Regeneration Patterns**
   - Peak hours bonus regeneration
   - Weekend vs weekday rates
   - Event-based multipliers

2. **Point Interactions**
   - Trade points between players
   - Point pools for teams/tribes
   - Point gambling/wagering

3. **Visual Enhancements**
   - Progress bars in Discord
   - Animated point changes
   - Point history graphs

4. **Complex Conditions**
   - Combined point requirements
   - Point ratios and percentages
   - Dynamic point costs

### Integration Opportunities
- **Combat System**: HP and defense points
- **Magic System**: Mana and spell costs
- **Crafting System**: Material points
- **Economy**: Point-to-currency exchange

## Usage Examples

### Basic Movement Check
```javascript
// In a Safari button action
{
  "actions": [
    {
      "type": "check_points",
      "config": {
        "pointType": "stamina",
        "amount": 1,
        "failureMessage": "You're too tired! Rest for {time}."
      }
    },
    {
      "type": "move_player",
      "config": {
        "coordinate": "C3"
      }
    },
    {
      "type": "modify_points",
      "config": {
        "pointType": "stamina",
        "amount": -1
      }
    }
  ]
}
```

### Combat with HP
```javascript
{
  "actions": [
    {
      "type": "modify_points",
      "config": {
        "entityId": "player_{userId}",
        "pointType": "hp",
        "amount": -10,
        "failureMessage": "The attack defeats you!"
      }
    },
    {
      "type": "display_text",
      "config": {
        "content": "You take 10 damage from the goblin!"
      }
    }
  ]
}
```

## Best Practices

1. **Start Simple**: Begin with one point type (stamina)
2. **Clear Communication**: Tell players regeneration timing
3. **Balanced Costs**: Make choices meaningful but not frustrating
4. **Progressive Disclosure**: Add complexity gradually
5. **Monitor Usage**: Track how players interact with limits

## New Feature: Stamina Items

**Added August 2025**: Items can now provide stamina boosts when consumed! See [Stamina Items Documentation](StaminaItems.md) for full details on creating and using consumable stamina items.

---

The Safari Points System provides a robust foundation for resource management in Discord-based games, enabling rich strategic gameplay while maintaining simplicity and performance.