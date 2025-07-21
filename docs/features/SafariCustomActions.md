# Safari Custom Actions Documentation

## Overview

Safari Custom Actions are dynamic, configurable actions that can be triggered by players through buttons or text commands. They support complex workflows including text displays, currency/item drops, follow-up actions, and conditional logic.

## Recent Updates (January 2025)

### String Select Interface
Custom Actions now use a string select dropdown for adding action types, replacing the previous button grid approach:
- **Cleaner UI**: Single dropdown instead of multiple buttons
- **Scalable**: Easy to add new action types
- **Consistent**: Matches other UI patterns in CastBot

### Button Bundling
Follow-up buttons are now automatically bundled with preceding display_text actions:
- **Reduces message clutter**: Combines related content
- **Better UX**: Logical grouping of text and actions
- **Automatic**: No configuration needed

### Drop Management Integration
Custom Actions now support the same drop management features as map locations:
- **Item Drops**: Give items with usage limits
- **Currency Drops**: Award currency with restrictions
- **Usage Tracking**: Once per player, once globally, or unlimited

## Action Types

### 1. Display Text
Shows formatted text with optional images and styling.

**Configuration:**
- Title (optional)
- Content (required)
- Accent Color (optional)
- Image URL (optional)

### 2. Give Item (New!)
Awards items to players with configurable usage limits.

**Configuration:**
- Item selection from available items
- Quantity
- Usage limit:
  - Unlimited
  - Once per player
  - Once globally (first come, first served)

**Example:**
```javascript
{
  type: 'give_item',
  config: {
    itemId: 'iron_sword_123',
    quantity: 1,
    limit: {
      type: 'once_per_player',
      claimedBy: ['userId1', 'userId2']
    }
  }
}
```

### 3. Give Currency (Enhanced!)
Awards currency with new usage limit options.

**Configuration:**
- Amount (positive or negative)
- Message (optional)
- Usage limit:
  - Unlimited (default)
  - Once per player
  - Once globally

**Example:**
```javascript
{
  type: 'give_currency',
  config: {
    amount: 100,
    message: 'You found treasure!',
    limit: {
      type: 'once_globally',
      claimedBy: 'userId123' // Single user for global limit
    }
  }
}
```

### 4. Follow-up Action
Triggers another Custom Action button.

**Configuration:**
- Target Custom Action ID
- Automatically bundles with preceding display_text

### 5. Conditional Action
Executes different actions based on conditions.

**Configuration:**
- Condition type and parameters
- Success actions
- Failure actions

## Creating Custom Actions

### Step 1: Access Custom Actions
1. Use `/prod_menu` → Safari Menu
2. Select "📌 Manage Custom Actions"
3. Choose location or create location-independent action

### Step 2: Create New Action
1. Click "Create New" from the dropdown
2. Enter action details:
   - **ID**: Unique identifier (auto-generated)
   - **Name**: Display name
   - **Description**: Purpose/usage
   - **Trigger Type**: Button or Text Command

### Step 3: Add Action Components
1. Use the string select dropdown to add actions
2. Configure each action's settings
3. Actions execute in order

### Step 4: Configure Drops (if applicable)
When adding Give Item or Give Currency actions:
1. Select the resource (item/currency)
2. Set quantity/amount
3. Choose usage limit
4. Configure button appearance (if triggered by button)

## Usage Limits

### Unlimited
- Default for backward compatibility
- Players can trigger repeatedly
- No tracking required

### Once Per Player
- Each player can claim once
- Tracked in `claimedBy` array
- Shows "Already claimed" when limit reached

### Once Globally
- First player to claim gets the reward
- Tracked with single user ID
- Button shows as disabled after claimed
- Text: "[Reward] - Already claimed"

## Drop Configuration UI

The drop configuration interface (reused from map drops) provides:

1. **Item/Currency Selection**
2. **Quantity/Amount Setting**
3. **Usage Limit Options**
4. **Button Customization** (for button triggers):
   - Button text
   - Emoji
   - Style (Primary/Secondary/Success/Danger)
5. **Reset Claims** option for admins

## Button States

For Custom Actions with usage limits:

### Available
- Normal button appearance
- Clickable
- Shows reward name

### Already Claimed (Per Player)
- Disabled state
- Gray appearance
- Text: "[Reward] - Already claimed"

### Globally Claimed
- Disabled state
- Gray appearance  
- Text: "[Reward] - Claimed by [Username]"

## Admin Features

### Testing Commands
Admins can now test text command triggers:
1. Click Location Actions for any coordinate
2. Use "Test Command" button (appears for admins only)
3. Enter command text to simulate player input

### Reset Claims
Admins can reset usage tracking:
1. Edit the Custom Action
2. Navigate to the drop configuration
3. Click "Reset Claims"
4. Confirm the reset

### Bypass Limits
Admins with appropriate permissions can bypass usage limits for testing.

## Data Storage

### Custom Actions
Stored in `safariContent.json`:
```javascript
{
  "guildId": {
    "buttons": {
      "actionId": {
        "id": "actionId",
        "name": "Treasure Chest",
        "actions": [
          {
            "type": "give_item",
            "order": 1,
            "config": {
              "itemId": "gold_coin",
              "quantity": 5,
              "limit": {
                "type": "once_per_player",
                "claimedBy": []
              }
            }
          }
        ]
      }
    }
  }
}
```

### Usage Tracking
Claims are tracked within each action's config:
- `claimedBy: []` - Array for per-player limits
- `claimedBy: "userId"` - Single ID for global limits
- No `claimedBy` field for unlimited actions

### Player Inventory
Items are added to `playerData.json`:
```javascript
{
  "guildId": {
    "players": {
      "userId": {
        "safari": {
          "inventory": {
            "gold_coin": {
              "quantity": 5,
              "firstObtained": 1234567890
            }
          }
        }
      }
    }
  }
}
```

## Best Practices

### 1. Logical Action Order
- Place display_text before follow-up buttons for automatic bundling
- Put give_item/currency after explanatory text
- Use conditional actions for branching logic

### 2. Clear Reward Communication
- Use descriptive button text
- Include reward details in display_text
- Provide feedback messages for all outcomes

### 3. Balanced Limits
- Use "once per player" for personal rewards
- Use "once globally" for server-wide achievements
- Use "unlimited" sparingly to prevent spam

### 4. Testing Workflow
1. Create action in test location
2. Test all paths (success/failure/limits)
3. Verify inventory/currency updates
4. Check button states
5. Reset claims and retest

## Troubleshooting

### "Already claimed" not showing
- Verify usage tracking is enabled
- Check `claimedBy` array in safariContent.json
- Ensure button ID matches in all handlers

### Items not appearing in inventory
- Confirm item exists in Safari items
- Check player has initialized Safari data
- Verify no errors in execution logs

### Currency not updating
- Check for negative balance prevention
- Verify amount is valid number
- Look for rate limiting issues

### Buttons not disabling
- Ensure claim check runs before render
- Verify button uses latest state
- Check for caching issues

## Migration Guide

### Updating Existing Currency Actions
Existing `update_currency` actions will default to unlimited. To add limits:

1. Edit the Custom Action
2. Select the currency action
3. Choose usage limit
4. Save changes

### Converting Location Drops
To convert map-based drops to Custom Actions:

1. Create new Custom Action
2. Add give_item/currency action
3. Copy drop settings
4. Update location to use Custom Action
5. Remove old drop configuration

## Related Documentation

- [Safari.md](./Safari.md) - Main Safari system overview
- [SafariMapExplorer.md](./SafariMapExplorer.md) - Map and location management
- [EntityEditFramework.md](../architecture/EntityEditFramework.md) - UI framework details
- [ButtonHandlerFactory.md](../architecture/ButtonHandlerFactory.md) - Button implementation patterns