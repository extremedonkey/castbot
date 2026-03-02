# Player Menu Actions

Custom Actions that appear as buttons in a player's `/menu`, allowing players to trigger actions from anywhere without needing to be at a specific map location.

## Overview

By default, Custom Actions are location-centric - they appear on map locations and can only be triggered when a player is at that coordinate. **Player Menu Actions** extend this by allowing any Custom Action to also appear in the player's `/menu` interface.

This enables use cases like:
- **Global abilities** - Spells or skills usable from anywhere
- **Quick access actions** - Frequently-used actions without map navigation
- **Storyline triggers** - Narrative moments accessible at any time

## User Guide

### Enabling an Action for Player Menu

1. Navigate to **Safari** > **Manage Custom Actions**
2. Select the action you want to enable
3. Click the **Coordinates** button (now labeled "Action Visibility")
4. In the **Player Menu** section, click **Show**

The toggle displays:
- **Player Menu: ✅ Visible** - Action appears in player `/menu`
- **Player Menu: ❌ Hidden** - Action only available at assigned locations

### How Players Access Menu Actions

1. Player opens `/menu`
2. Clicks **My Profile** to access their Player Menu
3. Action buttons appear at the bottom of the menu
4. Clicking an action triggers it (same as clicking at a map location)

### Visibility Rules

An action appears in the Player Menu when ALL conditions are met:
- `showInInventory: true` on the action
- Action has `trigger.type: 'button'` (not modal/text triggers)
- Component budget allows it (40-component Discord limit)

## Technical Reference

### Data Structure

```javascript
safariData[guildId].buttons = {
  "action_id_123": {
    id: "action_id_123",
    name: "Healing Spell",

    // Existing fields
    coordinates: ["B3"],
    trigger: {
      type: "button",
      button: { label: "Cast Heal", emoji: "✨", style: "Success" }
    },
    actions: [...],

    // Player Menu visibility
    showInInventory: true,  // Default: false

    // Optional: Override button appearance in menu
    inventoryConfig: {
      buttonLabel: null,    // Uses trigger.button.label if null
      buttonEmoji: null,    // Uses trigger.button.emoji if null
      buttonStyle: null,    // Uses trigger.button.style if null
      sortOrder: 0          // Lower = appears first
    }
  }
}
```

### Implementation Files

| File | Function | Purpose |
|------|----------|---------|
| `customActionUI.js` | `createCoordinateManagementUI()` | Toggle UI in Action Visibility screen |
| `playerManagement.js` | `createPlayerManagementUI()` | Renders action buttons in Player Menu |
| `app.js` | `toggle_inventory_*` handler | Saves toggle state |
| `buttonHandlerFactory.js` | `BUTTON_REGISTRY` | Button metadata |

### Button Handler Flow

```
Player clicks action button in /menu
           │
           ▼
┌─────────────────────────────────┐
│ Button ID: safari_{guildId}_{actionId}
│ (Same format as location buttons)
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ Existing safari_* handler       │
│ at app.js:4955                  │
└─────────────┬───────────────────┘
              │
              ▼
┌─────────────────────────────────┐
│ executeButtonActions()          │
│ (No changes needed - works      │
│  regardless of trigger source)  │
└─────────────────────────────────┘
```

### Component Budget System

The Player Menu uses budget-based component allocation to respect Discord's 40-component limit:

```javascript
// Calculate available budget
const currentCount = countComponents(finalComponents, { enableLogging: false });
const DISCORD_LIMIT = 40;
const SAFETY_BUFFER = 2;
const remainingBudget = DISCORD_LIMIT - SAFETY_BUFFER - currentCount;

// Each action row costs: 1 (row) + up to 5 (buttons) = 6 components
const maxRows = Math.floor(remainingBudget / 6);
const maxActions = Math.min(maxRows * 5, menuActions.length, 10);
```

**Logging output:**
```
🧰 Player Menu Actions: 3 actions enabled for menu
📊 Player Menu budget BEFORE actions: 25/40 used, 13 remaining for actions
✅ Added 3 menu action buttons to player menu
📋 Player Menu:
1. Container
  2. Section [HAS ACCESSORY]
...
  28. ActionRow
    29. Button
    30. Button
    31. Button
✅ Total components: 31/40
```

### Admin Warning

When 10+ actions are enabled for Player Menu, a warning is shown:

```
⚠️ Warning: 12 actions enabled for Player Menu.
Some actions may not appear due to Discord's 40-component limit.
```

## Edge Cases

### Location-Based Conditions

When an action is triggered from the Player Menu, there is no location context. Actions with `AT_LOCATION` conditions will **fail** when triggered from the menu.

**Recommendation:** Don't use location conditions on actions intended for Player Menu access.

### Text/Modal Triggers

Only `button` trigger type actions can appear in the Player Menu. Actions with `modal` triggers (text commands) are filtered out since they require typing input.

### Usage Limits

Usage limits (`once_per_player`, `once_globally`) work identically regardless of trigger source. If an action is claimed via Player Menu, it counts the same as if claimed at a location.

## Related Documentation

- [SafariCustomActions.md](SafariCustomActions.md) - Custom Actions system overview
- [PlayerCommands.md](PlayerCommands.md) - Text-based action invocation
- [Safari.md](Safari.md) - Safari system overview

---

*Implemented: January 2026*
*Related RaP: 0962_20260111_InventoryCustomActions_Analysis.md*
