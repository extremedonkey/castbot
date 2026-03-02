# CastBot Menu Hierarchy

> **Open this file when** you need to understand where a feature sits in the user-facing navigation, or decide where a new button should live in the menu tree. This is a snapshot — verify against the actual code if the tree looks wrong.

**Last Updated**: 2025-02-11

---

## Visual Menu Tree

```
/menu (Slash Command)
│
├─ Has Admin Permissions? (ManageChannels OR ManageRoles)
│  │
│  YES ─→ 📋 Production Menu [EPHEMERAL]
│  │      │
│  │      ├─ ✏️ Castlists, Applications and Season Management
│  │      │  ├─ 📋 Castlist Manager
│  │      │  ├─ 📝 Apps [Secondary]
│  │      │  ├─ 🧑‍🤝‍🧑 Players
│  │      │  ├─ 🏃‍♀️ Challenges (formerly Rounds)
│  │      │  └─ ☕ Donate
│  │      │
│  │      ├─ 🦁 Idol Hunts, Challenges and Safari
│  │      │  ├─ 🏪 Stores
│  │      │  ├─ 📦 Items
│  │      │  ├─ 🧭 Player Admin
│  │      │  ├─ 💰 Currency
│  │      │  └─ ⚙️ Settings
│  │      │
│  │      ├─ 🚀 Advanced Features
│  │      │  ├─ 🗺️ Map Admin → 🗺️ Map Explorer Menu
│  │      │  ├─ ⚡ Actions (Custom Action Editor)
│  │      │  ├─ 🧮 Analytics [Reece Only]
│  │      │  └─ 🪛 Tools → 🪛 Tools Menu
│  │      │
│  │      └─ ← Menu [Back]
│  │
│  NO ──→ 🪪 Player Menu [EPHEMERAL]
│         │
│         ├─ View Profile
│         ├─ Edit Profile
│         ├─ Vanity Roles
│         └─ (Global Stores if configured)
│
│
├─ 🧮 Analytics Menu [Reece Only, EPHEMERAL]
│  │
│  ├─ 📊 Analytics
│  │  ├─ Server List
│  │  ├─ Print Logs
│  │  ├─ Server Stats
│  │  └─ 🌈 Ultramonitor
│  │
│  ├─ 🔧 Admin Tools
│  │  ├─ Toggle Channel Logs
│  │  ├─ Test Role Hierarchy
│  │  └─ 💬 Msg Test
│  │
│  ├─ ☢️ Danger Zone
│  │  ├─ 🚨 Emergency Re-Init
│  │  ├─ ☢️ Nuke playerData
│  │  └─ ☢️ Nuke safariContent
│  │
│  └─ ← Menu [Back]
│
│
├─ 🪛 Tools Menu [EPHEMERAL]
│  │
│  ├─ 🪛 Run Setup
│  ├─ 🎯 Reaction Roles → 🎯 Reaction Roles Menu
│  ├─ 🔥 Tribes (Legacy)
│  ├─ 🕐 Availability → 🕐 Availability Menu
│  ├─ ❓ Need Help? [Link]
│  ├─ 📜 Terms of Service
│  ├─ 🔒 Privacy Policy
│  └─ ← Menu [Back to Production Menu]
│
│
├─ 🎯 Reaction Roles Menu [EPHEMERAL]
│  │
│  ├─ 🌍 Timezone Management
│  │  ├─ 🌍 View Timezones
│  │  ├─ ⏲️ Bulk Modify (no offset)
│  │  ├─ 🗺️ Custom Timezone
│  │  └─ 👍 Post React for Timezones
│  │
│  ├─ 💜 Pronoun Management
│  │  ├─ 💜 View Pronouns
│  │  ├─ 💙 Edit Pronouns
│  │  └─ 👍 Post React for Pronouns
│  │
│  └─ ← Tools [Back to Tools Menu]
│
│
├─ 🕐 Availability Menu [EPHEMERAL]
│  │
│  ├─ 📅 Post Availability Times
│  ├─ 👥 View Availability Groups
│  ├─ 🗑️ Clear My Availability
│  └─ ← Tools [Back to Tools Menu]
│
│
├─ 🗺️ Map Explorer Menu [EPHEMERAL]
│  │
│  ├─ 🗺️ Map Management
│  │  ├─ Create / Update Map
│  │  ├─ Delete Map
│  │  └─ Refresh Anchors
│  │
│  ├─ 🧭 Map Administration
│  │  ├─ Blacklisted Coords
│  │  ├─ Player Locations
│  │  └─ Paused Players
│  │
│  ├─ 🛠️ Map Configuration (moved from Safari Menu)
│  │  ├─ 📍 Location Editor
│  │  └─ 🚀 Safari Progress
│  │
│  └─ ← Menu [Back to Production Menu]
│
│
├─ 📋 Castlist Hub [EPHEMERAL]
│  │
│  ├─ Select Castlist (dropdown)
│  ├─ 👁️ View
│  ├─ ✏️ Edit Info
│  ├─ 🏕️ Add Tribe
│  ├─ 🔄 Order
│  └─ ← Menu [Back]
│
│
├─ 📝 Season Applications [EPHEMERAL]
│  │
│  ├─ Select Season (dropdown)
│  ├─ ✨ New Question
│  ├─ 📤 Post Apps Button
│  ├─ 🏆 Cast Ranking
│  ├─ ✏️ Edit Season
│  ├─ 🗑️ Delete Season
│  └─ ← Menu [Back]
│
│
└─ 🏪 Stores/Items/Currency/Rounds [EPHEMERAL]
   │
   ├─ (Feature-specific buttons)
   └─ ← Menu [Back to Production Menu]
```

---

## Menu Characteristics

### Production Menu
- **Access**: Admin only (ManageChannels OR ManageRoles)
- **Visibility**: Ephemeral (only visible to clicking admin)
- **Location**: `app.js` - `createProductionMenuInterface()`
- **Header**: Shows active season if set, otherwise "Production Menu"
- **Accent Color**: Blue (0x3498DB)

### Player Menu
- **Access**: All users
- **Visibility**: Ephemeral (only visible to user)
- **Location**: `playerManagement.js` - `createPlayerManagementUI()`
- **Features**: Profile editing, vanity roles, global stores
- **Accent Color**: Blue (0x3498DB)

### Map Explorer Menu
- **Access**: Admin only
- **Visibility**: Ephemeral
- **Location**: `app.js` - `safari_map_explorer` handler (line ~23580)
- **Purpose**: Map creation, administration, and configuration
- **Accent Color**: Teal (0x00AE86)
- **Back Navigation**: Returns to Production Menu
- **Features**: Create/update maps, blacklist management, player locations, location editor, safari progress

### Analytics Menu
- **Access**: Reece only (user ID: 391415444084490240)
- **Visibility**: Ephemeral
- **Location**: `app.js` - `createReeceStuffMenu()`
- **Purpose**: Server analytics, admin tools, danger zone
- **Accent Color**: Blue (0x3498DB)

### Tools Menu
- **Access**: Admin only
- **Visibility**: Ephemeral
- **Location**: `menuBuilder.js` - MENU_REGISTRY['setup_menu']
- **Purpose**: CastBot setup, pronoun/timezone management, availability system
- **Accent Color**: Blue (0x3498DB)
- **Back Navigation**: Returns to Production Menu

### Reaction Roles Menu
- **Access**: Admin only
- **Visibility**: Ephemeral
- **Location**: `app.js` - `prod_manage_pronouns_timezones` handler
- **Purpose**: Manage server reaction roles including pronouns, timezones, and ban traps
- **Accent Color**: Purple (0x9B59B6)
- **Back Navigation**: Returns to Tools Menu

### Availability Menu
- **Access**: Admin only
- **Visibility**: Ephemeral
- **Location**: `app.js` - `prod_availability` handler
- **Purpose**: Player availability management system
- **Accent Color**: Blue (0x3498DB)
- **Back Navigation**: Returns to Tools Menu

---

## Navigation Patterns

### Back Button Standards
All back buttons follow LEAN standards (see [LeanUserInterfaceDesign.md](LeanUserInterfaceDesign.md)):

**Pattern**:
```javascript
const backButton = new ButtonBuilder()
  .setCustomId('prod_menu_back')
  .setLabel('← Menu')
  .setStyle(ButtonStyle.Secondary);
  // NO emoji for main menu back button
```

**Locations**:
- Submenu → Production Menu: `prod_menu_back` with label "← Menu"
- Feature → Feature Menu: `{feature}_back` with label "← {Feature}" + feature emoji

---

## Button Organization by Feature

### Castlists & Seasons
- **Production Menu**: Castlists, Season Applications
- **Submenus**: Castlist Hub, Season Management
- **Back Target**: Production Menu

### Safari System
- **Production Menu**: Stores, Items, Player Admin, Rounds, Currency, Safari (advanced config)
- **Submenus**: Safari Menu (advanced), individual feature menus
- **Back Target**: Production Menu

### Player Management
- **Production Menu**: Players, Tribes
- **Submenus**: Individual management screens
- **Back Target**: Production Menu

### Tools & Setup
- **Production Menu**: Tools (button that opens Tools Menu)
- **Tools Menu**: Run Setup, Reaction Roles, Availability, Need Help?
- **Submenus**: Reaction Roles Menu, Availability Menu
- **Back Target**: Tools Menu → Production Menu

### Analytics & Admin
- **Production Menu**: Analytics (Reece only)
- **Submenus**: Analytics Menu (Reece only)
- **Back Target**: Production Menu

---

## Recent Changes

### 2025-02-11: Major Menu Restructure - Safari Menu Removal
**Rationale**: Flatten menu hierarchy and reduce clicks for common Safari operations. Safari menu added unnecessary nesting - most features are accessed frequently enough to warrant top-level placement.

**Changes**:
1. **Removed Safari Menu entirely** - Commented out `prod_safari_menu` button and `createSafariMenu()` function
2. **Promoted buttons to Production Menu**:
   - `safari_map_explorer` → Advanced Features row (relabeled "Map Admin")
   - `safari_action_editor` → Advanced Features row (relabeled "Actions")
3. **Moved buttons to Map Explorer**:
   - `safari_location_editor` → New third row in Map Explorer (with map filter)
   - `safari_progress` → New third row in Map Explorer (right of Location Editor)
4. **Renamed & Repositioned**:
   - `safari_rounds_menu` → "Challenges" 🏃‍♀️ (moved from Advanced Features to admin row, right of Players)
5. **Tribes moved to Tools Menu**:
   - `prod_manage_tribes` → Tools Menu (relabeled "Tribes (Legacy)")
   - **UPDATE (2026-03)**: `prod_manage_tribes` replaced by `reeces_stuff` (Reece's Stuff menu in Tools). See [CastlistV3.md](../features/CastlistV3.md) for the current castlist system.
6. **All back buttons verified** - Safari submenus use `prod_menu_back`, internal navigation preserved

**New Menu Flow**:
```
Production Menu → Map Admin → Map Explorer (with Location Editor + Safari Progress)
Production Menu → Actions → Custom Action Editor
Production Menu → Challenges → Rounds Menu
Production Menu → Tools → Reece's Stuff (replaced legacy Tribes)
```

**Impact**: Reduced navigation depth from 3 clicks (Menu → Safari → Feature) to 2 clicks (Menu → Feature) for Map Admin and Actions.

### 2025-02-11: Tools Menu Reorganization
**Rationale**: Consolidate setup-related features (initial setup, pronouns/timezones, availability) under a single Tools menu to reduce Production Menu clutter and create logical grouping.

**Changes**:
1. Moved "Pronouns & Timezones" button from Production Menu to Tools Menu
2. Updated Pronouns & Timezones Menu back button: `prod_menu_back` → `prod_setup`
3. Updated Availability Menu back button: `prod_menu_back` → `prod_setup`
4. Updated BUTTON_REGISTRY parent fields:
   - `prod_manage_pronouns_timezones`: `parent: 'production_menu'` → `parent: 'prod_setup'`
   - `prod_availability`: Added `parent: 'prod_setup'`
5. Updated MenuHierarchy.md with new Tools Menu structure and submenu details

**New Menu Flow**:
```
Production Menu → Tools → Pronouns & Timezones Menu
                       → Availability Menu
```

### 2025-01-19: Safari Feature Reorganization
**Rationale**: Safari features (Stores, Items, Rounds, Currency) can be used independently for Challenges and Idol Hunts without full Safari implementation (see [SeasonLifecycle.md](../concepts/SeasonLifecycle.md)).

**Changes**:
1. Created new section in Production Menu: "🦁 Idol Hunts, Challenges and Safari"
2. Moved 5 buttons from Safari Menu to Production Menu:
   - Stores
   - Items
   - Player Admin
   - Rounds
   - Currency
3. Renamed Safari Menu section "Map Administration" → "Advanced Safari Configuration"
4. Removed "Safari Administration" section (now empty)
5. All submenus now route back to Production Menu instead of Safari Menu

---

## Technical Debt & Future Improvements

### Migration to Menu Registry
**Status**: Foundation complete, gradual migration in progress

**Target Pattern** (from [MenuSystemArchitecture.md](../enablers/MenuSystemArchitecture.md)):
```javascript
const menu = await MenuBuilder.create('menu_id', context);
```

**Current State**: Most menus still built inline in app.js

**Priority Order**:
1. 🟢 Simple submenus: setup ✅ (migrated Jan 2025), tribes ⚱️ (pending)
2. ⚱️ Complex menus (safari, seasons) - Legacy
3. ⚱️ Dynamic menus (production, player) - Legacy

### Centralized Back Button Factory
**Status**: Proposed in tech debt analysis

**Benefits**:
- Single source of truth for back button configuration
- Prevents "forgot to update this menu" bugs
- Easy to change navigation patterns

**Implementation** (see Tech Debt section in ButtonHandlerFactory.md):
```javascript
const backButton = createBackButton('prod_menu_back');
```

---

## Related Documentation

- **[MenuSystemArchitecture.md](../enablers/MenuSystemArchitecture.md)** - Menu system patterns and MENU_REGISTRY
- **[ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md)** - Button patterns and BUTTON_REGISTRY
- **[ButtonHandlerRegistry.md](../enablers/ButtonHandlerRegistry.md)** - Complete button inventory
- **[LeanUserInterfaceDesign.md](LeanUserInterfaceDesign.md)** - Visual design standards
- **[SeasonLifecycle.md](../concepts/SeasonLifecycle.md)** - Context for Safari feature independence

---

## Notes for Claude Code

**When modifying menus**:
1. Update this document to reflect changes
2. Check all back buttons point to correct targets
3. Verify ephemeral flags are set correctly
4. Test navigation flow after changes
5. Update MenuSystemArchitecture.md if adding new menu types

**When adding new features**:
1. Decide where button belongs in hierarchy
2. Add to appropriate section
3. Create submenu if needed
4. Update this document's visual tree
5. Link from parent menu documentation
