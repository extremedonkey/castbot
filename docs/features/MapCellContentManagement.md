# Map Cell Content Management System

## Overview

The Map Cell Content Management System allows admins to create rich, interactive content for each map coordinate. This system integrates with the Safari button system to provide location-specific interactions.

## Architecture

### Data Structure (safariContent.json)

```json
{
  "guildId": {
    "maps": {
      "mapId": {
        "coordinates": {
          "C3": {
            "channelId": "1393282266473431281",
            "anchorMessageId": "1234567890123456789", // Discord message ID for live updates
            "baseContent": {
              "title": "📍 The Ancient Well",
              "description": "In the center of the forested grove, you see a glimmer coming from a treasure chest buried beneath ancient roots...",
              "image": "https://cdn.discordapp.com/..." // Optional location image
            },
            "buttons": ["open_chest_123456", "examine_roots_789012"], // Safari button IDs
            "cellType": "forest", // For future categorization
            "discovered": false,
            "specialEvents": []
          }
        }
      }
    }
  }
}
```

### Message Structure

Each coordinate channel contains an "anchor message" that is posted during map creation and updated whenever content changes:

```
┌─────────────────────────────────────────┐
│ [Fog of War Map Image]                  │
├─────────────────────────────────────────┤
│ # 📍 The Ancient Well                   │
│                                         │
│ In the center of the forested grove,   │
│ you see a glimmer coming from a        │
│ treasure chest buried beneath ancient   │
│ roots...                                │
├─────────────────────────────────────────┤
│ [Optional Location Image Gallery]       │
├─────────────────────────────────────────┤
│ [🪙 Open Chest] [🌳 Examine Roots]     │ <- Safari Buttons
├─────────────────────────────────────────┤
│ [📍 Location Actions]                   │ <- Admin/Prod only
└─────────────────────────────────────────┘
```

## Implementation Flow

### 1. Map Creation Enhancement

When `map_create` is executed:

1. Create Discord channels (existing)
2. Generate fog of war maps (existing)
3. **NEW**: Post anchor message with initial content
4. **NEW**: Store anchor message ID in safariContent.json
5. **NEW**: Include Location Actions button (visible to all, functional for admins)

### 2. Location Actions Button

Button ID: `map_location_actions_{coordinate}`

When clicked by admin/prod:
- Opens ephemeral entity management UI
- Shows current location content preview
- Allows editing via entity framework
- Changes immediately update anchor message

### 3. Entity Framework Integration

The system uses the standard entity management UI:

```javascript
// Entity type definition
case 'map_cell':
  return safariData[guildId]?.maps?.[activeMapId]?.coordinates || {};

// Field groups
case 'map_cell':
  return {
    info: { 
      label: 'Location Info', 
      emoji: '📝', 
      fields: ['title', 'description'] 
    },
    media: { 
      label: 'Media', 
      emoji: '🖼️', 
      fields: ['image'] 
    },
    interaction: { 
      label: 'Safari Buttons', 
      emoji: '🎯', 
      fields: ['buttons'] 
    }
  };
```

### 4. Anchor Message Updates

Whenever cell content is edited:

1. Save changes to safariContent.json
2. Fetch stored `anchorMessageId`
3. Update Discord message via REST API
4. Maintain consistency across all views

### 5. Repost Functionality

The Location Actions menu includes a "Repost Content" option that:
- Creates a new duplicate of the anchor message
- Useful when chat has scrolled past the original
- Does NOT update the anchor message ID

## Button Patterns

### Location Actions Button
- **ID**: `map_location_actions_{coordinate}`
- **Visibility**: All users
- **Functionality**: Admin/Prod only (ephemeral response)
- **Purpose**: Access cell content management

### Safari Button Integration
- Existing Safari buttons linked by ID
- Displayed in separate container below content
- Execute normal Safari actions when clicked
- Can be location-specific (e.g., "Open Chest at C3")

## Permissions

- **View Content**: All users with channel access
- **Edit Content**: Admin/Prod (Manage Roles permission)
- **Repost Content**: All users
- **Safari Buttons**: Based on individual button permissions

## Migration from Modal System

1. Remove `map_grid_edit_*` handlers
2. Remove `map_grid_view_*` handlers  
3. Remove modal submission handlers
4. Remove "Edit Grid Content" buttons from channels
5. Implement new Location Actions system

## Future Enhancements

- Discovery mechanics (content changes on first visit)
- Conditional content based on items/progress
- Time-based content changes
- Location-specific shops/NPCs
</content>