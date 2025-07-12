# Map Cell Content Implementation Guide

## Phase 1: Modify Map Creation

### File: mapExplorer.js

#### Update `postFogOfWarMapsToChannels` function:

```javascript
async function postFogOfWarMapsToChannels(guild, fullMapPath, gridSystem, channels, coordinates) {
  // ... existing fog of war generation ...
  
  // NEW: Create anchor message with content
  const anchorMessage = await channel.send({
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      components: [
        // Fog of War Map
        {
          type: 12, // Media Gallery
          items: [{
            media: { url: attachment.url },
            description: `Map view from ${coord}`
          }]
        },
        { type: 14 }, // Separator
        // Location Content
        {
          type: 10, // Text Display
          content: `# ${coordData.baseContent.title}\n\n${coordData.baseContent.description}`
        },
        // Safari Buttons Container (if any)
        ...(coordData.buttons?.length > 0 ? [
          { type: 14 }, // Separator
          ...createSafariButtonComponents(coordData.buttons, guildId)
        ] : []),
        // Location Actions Button
        {
          type: 1, // Action Row
          components: [{
            type: 2, // Button
            custom_id: `map_location_actions_${coord}`,
            label: 'Location Actions',
            style: 2, // Secondary
            emoji: { name: '📍' }
          }]
        }
      ]
    }]
  });
  
  // NEW: Store anchor message ID
  coordData.anchorMessageId = anchorMessage.id;
}
```

## Phase 2: Create Location Actions Handler

### File: app.js

```javascript
} else if (custom_id.startsWith('map_location_actions_')) {
  return ButtonHandlerFactory.create({
    id: 'map_location_actions',
    ephemeral: true,
    handler: async (context) => {
      const coord = custom_id.replace('map_location_actions_', '');
      
      // Check admin permissions
      if (!hasPermission(context.member, PermissionFlagsBits.ManageRoles)) {
        return {
          content: '❌ You need Manage Roles permission to edit location content.',
          ephemeral: true
        };
      }
      
      // Get map data
      const safariData = await loadSafariContent();
      const activeMapId = safariData[context.guildId]?.maps?.active;
      const coordData = safariData[context.guildId]?.maps?.[activeMapId]?.coordinates?.[coord];
      
      if (!coordData) {
        return {
          content: '❌ Location data not found.',
          ephemeral: true
        };
      }
      
      // Create entity management UI for this coordinate
      const { createEntityManagementUI } = await import('./entityManagementUI.js');
      const ui = await createEntityManagementUI({
        entityType: 'map_cell',
        guildId: context.guildId,
        selectedId: coord,
        mode: 'edit'
      });
      
      return {
        ...ui,
        ephemeral: true
      };
    }
  })(req, res, client);
}
```

## Phase 3: Extend Entity Management UI

### File: entityManagementUI.js

```javascript
// Add to getEntitiesForType
case 'map_cell':
  const activeMapId = guildData.maps?.active;
  return guildData.maps?.[activeMapId]?.coordinates || {};

// Add to getFieldGroups  
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

// Add custom display for map cells
function createEntityDisplay(entity, entityType, safariConfig) {
  if (entityType === 'map_cell') {
    const lines = [];
    lines.push(`**Location**: ${entity.id || 'Unknown'}`);
    lines.push(`**Title**: ${entity.baseContent?.title || 'Untitled'}`);
    lines.push(`**Description**: ${entity.baseContent?.description || 'No description'}`);
    if (entity.buttons?.length > 0) {
      lines.push(`**Safari Buttons**: ${entity.buttons.length} configured`);
    }
    return {
      type: 10, // Text Display
      content: lines.join('\n')
    };
  }
  // ... existing display logic ...
}
```

## Phase 4: Update Anchor Messages

### File: mapCellUpdater.js (NEW)

```javascript
import { loadSafariContent, saveSafariContent } from './safariManager.js';
import { DiscordRequest } from './utils.js';

export async function updateAnchorMessage(guildId, coordinate, client) {
  const safariData = await loadSafariContent();
  const activeMapId = safariData[guildId]?.maps?.active;
  const coordData = safariData[guildId]?.maps?.[activeMapId]?.coordinates?.[coordinate];
  
  if (!coordData?.anchorMessageId || !coordData?.channelId) {
    console.error(`No anchor message found for ${coordinate}`);
    return false;
  }
  
  try {
    const channel = await client.channels.fetch(coordData.channelId);
    const message = await channel.messages.fetch(coordData.anchorMessageId);
    
    // Reconstruct the message with updated content
    const updatedComponents = createAnchorMessageComponents(coordData, guildId);
    
    await message.edit({
      flags: (1 << 15), // IS_COMPONENTS_V2
      components: updatedComponents
    });
    
    console.log(`✅ Updated anchor message for ${coordinate}`);
    return true;
  } catch (error) {
    console.error(`Failed to update anchor message for ${coordinate}:`, error);
    return false;
  }
}

function createAnchorMessageComponents(coordData, guildId) {
  // Similar structure to initial post
  return [{
    type: 17, // Container
    components: [
      // ... fog of war map ...
      // ... location content ...
      // ... safari buttons ...
      // ... location actions button ...
    ]
  }];
}
```

## Phase 5: Safari Button Helper

### File: safariButtonHelper.js (NEW)

```javascript
export function createSafariButtonComponents(buttonIds, guildId) {
  if (!buttonIds || buttonIds.length === 0) return [];
  
  const components = [];
  const rows = [];
  let currentRow = [];
  
  for (const buttonId of buttonIds) {
    // Get button data from safari system
    const button = safariData[guildId]?.buttons?.[buttonId];
    if (!button) continue;
    
    const buttonComponent = {
      type: 2, // Button
      custom_id: `safari_${guildId}_${buttonId}_${Date.now()}`,
      label: button.label,
      style: getButtonStyle(button.style),
      emoji: button.emoji ? { name: button.emoji } : undefined
    };
    
    currentRow.push(buttonComponent);
    
    // Max 5 buttons per row
    if (currentRow.length === 5) {
      rows.push({
        type: 1, // Action Row
        components: currentRow
      });
      currentRow = [];
    }
  }
  
  // Add remaining buttons
  if (currentRow.length > 0) {
    rows.push({
      type: 1, // Action Row
      components: currentRow
    });
  }
  
  return rows;
}
```

## Migration Steps

1. **Backup current data**
2. **Deploy new code** with entity framework support
3. **Run migration script** to add anchorMessageId to existing maps
4. **Remove old handlers** for map_grid_edit/view
5. **Test with new map creation**
6. **Update existing maps** with Location Actions button

## Testing Checklist

- [ ] Map creation posts anchor message
- [ ] Location Actions button shows for all users
- [ ] Only admins can access edit UI
- [ ] Entity framework properly loads map cells
- [ ] Editing updates anchor message live
- [ ] Safari buttons display and function
- [ ] Repost creates duplicate message
- [ ] Permission checks work correctly
</content>