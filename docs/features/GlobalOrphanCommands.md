# Global Orphan Commands Feature

## Overview

Global Orphan Commands enables players to access command functionality from their `/menu` interface, allowing text-based interactions with Custom Actions that have no location assignments (orphan actions). This feature bridges the gap between location-specific Safari commands and server-wide interactive experiences.

## Current State Analysis

### ✅ Implemented Foundation
- **Orphan Actions Support**: Custom Actions with `coordinates: []` can be created via Production Menu → Safari → Action Editor
- **Modal Processing**: `player_command_modal_` handler supports global action search fallback
- **Button Infrastructure**: `player_enter_command` pattern established for location-based commands

### 📍 Current Command Access Points

#### 1. Map Location Buttons (`player_enter_command_{coordinate}`)
**Location**: `entityManagementUI.js:473-480`
- Added to ALL `map_cell` entities for production team testing
- Uses bot application emoji 'command' (`getBotEmoji('command', guildId)`)
- Shows modal with coordinate embedded: `player_command_modal_{coord}`

#### 2. Location Actions Interface (Player Mode)
**Location**: `app.js:21355-21359`
- Appears when non-admin clicks Location button from player menu
- Same functionality as map location buttons
- Uses coordinate-specific modal ID

#### 3. Admin Test Command (`admin_test_command_{coordinate}`)
**Location**: `app.js:21625-21634`
- Admin equivalent with identical processing
- Same modal, same command resolution logic

### 🔧 Underlying Architecture

#### Command Resolution Flow
```javascript
// 1. Button Handler (app.js:21592-21621)
player_enter_command_{coord} → Modal: player_command_modal_{coord}

// 2. Modal Processing (app.js:32102-32386)
player_command_modal_{coord} → Command Resolution:
  1. Search location-specific actions at {coord}
  2. Search global/orphan actions (coordinates: [])
  3. Execute executeOn:"false" fallback actions
  4. Show "command not recognized"
```

#### Orphan Action Search Logic
```javascript
// NEW: Global action search fallback (app.js:32193-32204)
for (const actionId of Object.keys(safariData[guildId]?.buttons || {})) {
    const action = safariData[guildId].buttons[actionId];
    if (action.trigger?.type === 'modal' &&
        (!action.coordinates || action.coordinates.length === 0)) {
        const phrases = action.trigger.phrases || [];
        if (phrases.some(phrase => phrase.toLowerCase() === command)) {
            matchingAction = { ...action, id: actionId };
            break;
        }
    }
}
```

## Safari Customization System

### Current Interface (`safari_customize_terms`)
**Location**: `app.js:8940-8960`, `safariConfigUI.js:15-45`

**Existing Field Groups**:
```javascript
fieldGroups: {
    'currency_inventory': {
        label: 'Currency & Inventory',
        fields: ['currencyName', 'inventoryName', 'inventoryEmoji']
    },
    'events': {
        label: 'Events',
        fields: ['eventName', 'harvestName', 'attackName']
    },
    'rounds': {
        label: 'Rounds',
        fields: ['roundName', 'roundResultsName']
    }
}
```

**Current Button Layout**:
- Currency & Inventory (🪙)
- Events (⚡)
- Rounds (🔄)
- Stamina Settings (⚡) - Admin only
- **[NEW SLOT]** - Room for Player Menu button

## Menu System Architecture & Hierarchy

### 🚨 CRITICAL: Menu Type Clarification

**There are THREE distinct menu types that must be understood:**

#### 1. **REAL Production Menu** (`/menu` by prod team members)
- **Triggered**: `/menu` slash command by users with ManageRoles permissions
- **Purpose**: Administrative interface for production team
- **Content**: Completely different UI (setup, player management, Safari admin, etc.)
- **Global Commands**: **NOT AFFECTED** by this feature - this is admin interface only

#### 2. **Regular Player Menu** (`/menu` by normal players)
- **Triggered**: `/menu` slash command by users WITHOUT ManageRoles permissions
- **Purpose**: Player interface for personal management
- **Content**: Player info + castlists + Safari player features
- **Global Commands**: **WILL BE AFFECTED** - this is where the feature applies

#### 3. **"Player Profile" Preview** (`prod_player_menu` button)
- **Triggered**: Clicking "🪪 Player Profile" button from REAL Production Menu
- **Purpose**: Preview of what Regular Player Menu looks like (for testing/debugging)
- **Content**: **IDENTICAL** to Regular Player Menu (should have no deviations)
- **Global Commands**: **WILL BE AFFECTED** - should match Regular Player Menu exactly

### Menu Rendering Logic (`playerManagement.js:177-542`)

**Component Order** (applies to Regular Player Menu and Player Profile Preview):
```javascript
[
  mainContainer,           // Always present (player info + management buttons)
  applicationContinueRow,  // Conditional: only in application channels
  ...castlistRows,         // Conditional: unless hideBottomButtons = true
  ...globalStoreRows,      // Conditional: Safari Round > 0
  inventoryRow             // Conditional: Safari initialized + Round > 0
]
```

### Safari Inventory Row Integration Point
**Location**: `playerManagement.js:488-490`

**Current Button Logic**:
```javascript
// Only show Safari buttons if player initialized AND not Round 0
if (isInitialized && currentRound && currentRound !== 0) {
    const inventoryComponents = [];

    // Context-specific buttons based on menu type
    if (title === 'CastBot | My Profile') {
        // Player Profile Preview (prod_player_menu): Location Actions + Inventory
        [locationActionsButton?, inventoryButton]
    } else {
        // Regular Player Menu: Navigate + Location Actions + Inventory
        [navigateButton?, locationActionsButton?, inventoryButton]
    }
}
```

### 🔄 Additional Menu: Viral Menu (`viral_menu`)
- **Triggered**: Button click from `/castlist` command (available to both prod and players)
- **Behavior**: Should follow same rules as above:
  - If user is prod team member → follows REAL Production Menu rules (not affected)
  - If user is regular player → follows Regular Player Menu rules (affected by feature)
- **Implementation**: Should reuse existing menu system, not separate UI code

## Proposed Implementation Design

### 1. Configuration Integration

#### New Field Group in Safari Customization
```javascript
// Add to safariConfigUI.js field groups
'player_interface': {
    label: 'Player Menu',
    fields: ['enableGlobalCommands']  // Boolean toggle
}
```

#### Button Addition (5th button - final slot)
```javascript
// safariConfigUI.js after stamina settings button
fieldGroupButtons.push({
    type: 2, // Button
    custom_id: 'safari_player_menu_config',
    label: 'Player Menu',
    style: 2, // Secondary (grey)
    emoji: { name: '🕹️' }
});
```

### 2. Modal Configuration Pattern

**Following `safari_store_stock_modal_*` Pattern**:
```javascript
{
    title: "Player Menu Configuration",
    custom_id: "safari_player_menu_config_modal",
    components: [
        {
            type: 18, // Label (Components V2)
            label: "Command Menu Button",
            description: "Allow players to try commands from their /menu",
            component: {
                type: 3, // String Select
                custom_id: "enable_global_commands",
                placeholder: "Allow global commands to be used outside of Safari, for idol hunts or challenges.",
                min_values: 1,
                max_values: 1,
                options: [
                    {
                        label: "Yes",
                        value: "true",
                        description: "Show command button in player /menu",
                        default: false // Set dynamically based on current setting
                    },
                    {
                        label: "No",
                        value: "false",
                        description: "Hide command button from player /menu",
                        default: false // Set dynamically based on current setting
                    }
                ]
            }
        }
    ]
}
```

### 3. Data Storage Structure

**Add to Safari Config**:
```javascript
safariConfig: {
    // ... existing fields
    enableGlobalCommands: true // boolean, defaults to true for new servers
}
```

**Default Value Strategy**:
```javascript
// Treat undefined as enabled (backward compatibility)
const enableGlobalCommands = safariConfig.enableGlobalCommands !== false;
```

### 4. Player Menu Integration

**Integration Point**: `playerManagement.js` inventory button section

**🚨 CRITICAL**: Only apply to Regular Player Menu and Player Profile Preview, NOT REAL Production Menu

```javascript
// Check configuration (only for player-facing menus)
const enableGlobalCommands = safariConfig.enableGlobalCommands !== false;

if (enableGlobalCommands) {
    const globalCommandButton = new ButtonBuilder()
        .setCustomId(`player_enter_command_global`) // Coordinate-less variant
        .setLabel('Enter Command')
        .setEmoji(getBotEmoji('command', guildId))
        .setStyle(2); // Secondary

    inventoryComponents.push(globalCommandButton);
}
```

**Implementation Logic**:
- ✅ **Regular Player Menu**: Show button if enabled
- ✅ **Player Profile Preview** (`prod_player_menu`): Show button if enabled (should match Regular Player Menu)
- ❌ **REAL Production Menu**: Never show this button (completely different interface)
- ❌ **Viral Menu** (if prod user): Don't show button (follows prod rules)
- ✅ **Viral Menu** (if regular player): Show button if enabled (follows player rules)

### 5. Button Handler Registry Additions

```javascript
'safari_player_menu_config': {
    label: 'Player Menu',
    description: 'Configure global command button in player menu',
    emoji: '🕹️',
    style: 'Secondary',
    category: 'safari'
},
'player_enter_command_global': {
    label: 'Enter Command',
    description: 'Enter a text command from anywhere (global)',
    emoji: '⌨️',
    style: 'Secondary',
    category: 'safari_player'
}
```

## Technical Implementation Requirements

### 1. Handler Implementation
- **Button Handler**: `safari_player_menu_config` in `app.js`
- **Modal Handler**: `safari_player_menu_config_modal` in `app.js`
- **Global Command Handler**: `player_enter_command_global` in `app.js`

### 2. Modal Processing
- Global command button uses modal: `player_command_modal_global`
- Existing `player_command_modal_` handler already supports orphan actions
- No changes needed to command resolution logic

### 3. Button Factory Registration
- Add new button entries to `BUTTON_REGISTRY` in `buttonHandlerFactory.js`
- Follow existing patterns for permissions and categorization

## Key Technical Insights

### Orphan Actions System
- **Storage**: Actions with `coordinates: []` in `safariData[guildId].buttons`
- **Creation**: Via Production Menu → Safari → Action Editor (no location assignment)
- **Triggers**: Support modal/phrase triggers like location-specific actions
- **Execution**: Uses same `executeButtonActions()` pipeline as location actions

### Command Resolution Priority
1. **Location-specific actions** (if coordinate provided)
2. **Global/orphan actions** (coordinate-agnostic)
3. **executeOn:"false" fallback actions**
4. **"Command not recognized" error**

### Button Factory Pattern
All buttons MUST be registered in `BUTTON_REGISTRY` to avoid "This interaction failed" errors.

## Default Behavior Strategy

### New Servers
- `enableGlobalCommands` defaults to `true` (enabled)
- Global command button shows in player menu by default

### Existing Servers
- `enableGlobalCommands` undefined treated as `true` (enabled)
- Maintains backward compatibility
- Only hidden when explicitly set to `false`

### UI Visibility Rules
```javascript
// Show button unless explicitly disabled
const showGlobalCommands = safariConfig.enableGlobalCommands !== false;
```

## Integration Points Summary

1. **Safari Customization UI**: Add Player Menu configuration button
2. **Modal System**: New config modal with Yes/No string select
3. **Player Menu**: Conditional global command button in inventory row
4. **Button Registry**: Register all new button handlers
5. **Data Storage**: Extend `safariConfig` with `enableGlobalCommands` field

## References

- **Components V2**: [docs/standards/ComponentsV2.md](../standards/ComponentsV2.md)
- **Button Handler Factory**: [docs/enablers/ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md)
- **Safari Custom Experiences**: [docs/features/SafariCustomExperiences.md](SafariCustomExperiences.md)
- **Player Management System**: `playerManagement.js:177-542`
- **Safari Configuration UI**: `safariConfigUI.js:15-45`

## Implementation Status

- ✅ **Foundation Complete**: Orphan actions and command resolution implemented
- ⏳ **Configuration UI**: Needs implementation
- ⏳ **Player Menu Integration**: Needs implementation
- ⏳ **Button Handlers**: Need implementation
- ⏳ **Testing**: Full feature testing required