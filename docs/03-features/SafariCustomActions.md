# Safari Custom Actions Documentation

## Terminology

> **Standardized terminology** — use these terms consistently in code, docs, and UI:
>
> | Concept | Preferred Term | Legacy Names (still in code/data) | Data Path |
> |---------|---------------|-----------------------------------|-----------|
> | The top-level entity (e.g., `harvest_and_attack_test_1772798001927`) | **Action** | Custom Action, Safari Button, button, interactive action | `safariData[guildId].buttons[actionId]` |
> | How an Action is invoked | **Trigger** | Button Click, Text Command, Modal, Player Command | `action.trigger.type` (`'button'`, `'modal'`, `'select'`, `'schedule'`) |
> | An individual step an Action executes | **Outcome** | Action Type, sub-action, action component | `action.actions[]` — each has `.type` and `.config` |
>
> **Why "buttons" in the data path?** The storage key `guildData.buttons` is a legacy artifact from when Actions could only be triggered by button clicks. Renaming it would require a data migration, so it stays — but conceptually it holds **Actions**, not buttons.

## Overview

Actions are dynamic, configurable workflows that can be triggered by players through buttons, text commands, select menus, or schedules. They support complex workflows including text displays, currency/item drops, follow-up actions, and conditional logic.

## Recent Updates (January 2026)

### Give / Remove Item Action
The `give_item` action now supports both **giving** and **removing** items via an `operation` field:
- **Give Item** (default): Adds items to player inventory
- **Remove Item**: Removes items from player inventory (for crafting, penalties, quest mechanics)
- **Backwards Compatible**: Existing actions default to "give" operation
- **Smart Messages**: Different feedback based on whether player had enough items

### UI Label Updates
- "Give Item" → "Give / Remove Item" in action type selector
- "Give Currency" → "Give / Remove Currency" in action type selector

---

## Previous Updates (January 2025)

### String Select Interface
Actions now use a string select dropdown for adding outcome types, replacing the previous button grid approach:
- **Cleaner UI**: Single dropdown instead of multiple buttons
- **Scalable**: Easy to add new outcome types
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

## Outcome Types

### 1. Display Text
Shows formatted text with optional images and styling.

**Configuration:**
- Title (optional)
- Content (required)
- Accent Color (optional)
- Image URL (optional)

### 2. Give / Remove Item
Awards or removes items from players with configurable usage limits.

**Configuration:**
- Item selection from available items
- Quantity (always positive)
- **Operation** (new):
  - `give` - Adds items to inventory (default)
  - `remove` - Removes items from inventory
- Usage limit:
  - Unlimited
  - Once per player
  - Once globally (first come, first served)

**Give Example:**
```javascript
{
  type: 'give_item',
  config: {
    itemId: 'iron_sword_123',
    quantity: 1,
    operation: 'give',  // Default - can be omitted
    limit: {
      type: 'once_per_player',
      claimedBy: ['userId1', 'userId2']
    }
  }
}
```

**Remove Example:**
```javascript
{
  type: 'give_item',
  config: {
    itemId: 'health_potion_456',
    quantity: 2,
    operation: 'remove',  // Takes items from player
    limit: {
      type: 'unlimited'  // Can keep attempting removal
    }
  }
}
```

**Player Messages:**
| Scenario | Message |
|----------|---------|
| Give success | 🎁 You receive **3x** of 🧪 **Health Potion**! |
| Remove (had enough) | 🧨 You lose **2x** of 🧪 **Health Potion**! |
| Remove (partial) | 🧨 An attempt was made to remove **5x** of 🧪 **Health Potion**, but you only had **2x** available.<br>You now have **0x** of 🧪 **Health Potion**. |

**Use Cases:**
- **Crafting**: Remove base materials, give crafted item
- **Penalties**: Troll smashes your health potion
- **Quest mechanics**: Consume quest items on completion
- **Conditional logic**: Check if player has item, then remove it

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
Triggers another Action.

**Configuration:**
- Target Custom Action ID
- Automatically bundles with preceding display_text

### 5. Conditional Action
Executes different actions based on conditions.

**Configuration:**
- Condition type and parameters
- Success actions
- Failure actions

### 6. Modify Attribute
Modifies player attributes (HP, Mana, Strength, etc.).

**Configuration:**
- Attribute to modify
- Operation: Add, Subtract, or Set
- Amount
- Display mode (silent or feedback)
- Usage limits

See [Attribute System](../../01-RaP/0964_20260109_AttributeSystem_Analysis.md) for details.

---

## Condition Types

Conditions determine whether actions execute. Multiple conditions can be combined with AND/OR logic.

| Type | Icon | Description | Example |
|------|------|-------------|---------|
| **Currency** | 🪙 | Check player's currency | Currency ≥ 100 |
| **Item** | 📦 | Check if player has/doesn't have item | Has Gold Key |
| **Role** | 👑 | Check if player has/doesn't have Discord role | Has @VIP role |
| **Attribute** | 📊 | Check single attribute value | Mana ≥ 20, HP < 50% |
| **Compare Attributes** | ⚔️ | Compare two attributes | Strength > Dexterity |
| **Multi-Attribute** | 📈 | Check multiple attributes | All stats ≥ 10 |

### Attribute Conditions

Check player attributes with flexible comparison options:

- **Resource attributes** (HP, Mana, Stamina): Compare current, max, or percentage
- **Stat attributes** (Strength, Dexterity): Compare value
- **Operators**: ≥, ≤, =, >, <
- **Item Bonuses**: Optionally include equipment modifiers

**Example**: "If Mana current ≥ 20" → displays as `📊 mana ≥ 20`

### Compare Attributes (⚔️)

Compare two attributes against each other:

- Compare any two attributes (same or different types)
- Supports resource targets (current/max/percent) for each
- Optional item bonus inclusion

**Example**: "If Strength > Dexterity" → displays as `⚔️ strength ≥ dexterity`

### Multi-Attribute Check (📈)

Check multiple attributes with aggregation modes:

- **All**: Every attribute must pass (e.g., "All stats ≥ 10")
- **Any**: At least one must pass (e.g., "Any stat ≥ 20")
- **Sum**: Total of all values (e.g., "Sum of stats ≥ 50")
- **Average**: Average of all values (e.g., "Average stat ≥ 15")

Shortcuts: `all_stats`, `all_resources`, `all`

See [Attribute Conditions](./AttributeConditions.md) for full documentation.

---

## Creating Actions

### Step 1: Access Actions
1. Use `/prod_menu` → Safari Menu
2. Select "📌 Manage Custom Actions"
3. Choose location or create a global action

### Step 2: Create New Action
1. Click "Create New" from the dropdown
2. Enter action details:
   - **ID**: Unique identifier (auto-generated)
   - **Name**: Display name
   - **Description**: Purpose/usage
   - **Trigger Type**: Button or Text Command

### Step 3: Add Outcomes
1. Use the string select dropdown to add outcomes
2. Configure each outcome's settings
3. Outcomes execute in order

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

For Actions with usage limits:

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
1. Edit the Action
2. Navigate to the drop configuration
3. Click "Reset Claims"
4. Confirm the reset

### Bypass Limits
Admins with appropriate permissions can bypass usage limits for testing.

## Data Storage

### Actions
Stored in `safariContent.json` (under legacy key `buttons`):
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
              "operation": "give",
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

1. Edit the Action
2. Select the currency outcome
3. Choose usage limit
4. Save changes

### Converting Location Drops
To convert map-based drops to Custom Actions:

1. Create new Action
2. Add give_item/currency outcome
3. Copy drop settings
4. Update location to use Action
5. Remove old drop configuration

## Related Documentation

- [Safari.md](./Safari.md) - Main Safari system overview
- [SafariMapExplorer.md](./SafariMapExplorer.md) - Map and location management
- [EntityEditFramework.md](../architecture/EntityEditFramework.md) - UI framework details
- [ButtonHandlerFactory.md](../architecture/ButtonHandlerFactory.md) - Button implementation patterns