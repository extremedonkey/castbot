# CastBot Menu Hierarchy

**Purpose**: Visual reference for the complete menu structure and navigation flow in CastBot.

**Last Updated**: 2025-01-19

**Status**: 🚧 **Undergoing Restructure** - Safari features being reorganized under Production Menu

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
│  │      │  ├─ 📋 Castlists
│  │      │  ├─ 📝 Season Applications [Secondary]
│  │      │  ├─ 🧑‍🤝‍🧑 Players
│  │      │  ├─ 🔥 Tribes
│  │      │  └─ 💜 Pronouns & Timezones
│  │      │
│  │      ├─ 🦁 Idol Hunts, Challenges and Safari
│  │      │  ├─ 🏪 Stores
│  │      │  ├─ 📦 Items
│  │      │  ├─ 🛡️ Player Admin
│  │      │  ├─ ⏳ Rounds
│  │      │  └─ 💰 Currency
│  │      │
│  │      ├─ 🚀 Advanced Features
│  │      │  ├─ 🪛 Setup
│  │      │  ├─ 🧮 Analytics [Reece Only]
│  │      │  ├─ 🦁 Safari
│  │      │  └─ 🪪 Player Menu [Preview]
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
├─ 🦁 Safari Menu [EPHEMERAL]
│  │
│  ├─ 🦁 Advanced Safari Configuration
│  │  ├─ 🗺️ Map Admin
│  │  ├─ 📍 Location Editor
│  │  ├─ ⚡ Action Editor
│  │  ├─ 🚀 Safari Progress
│  │  └─ ⚙️ Settings
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

### Safari Menu
- **Access**: Admin only
- **Visibility**: Ephemeral
- **Location**: `app.js` - `createSafariMenuInterface()`
- **Purpose**: Advanced map and custom action configuration
- **Accent Color**: Orange (0xf39c12)
- **Back Navigation**: Returns to Production Menu

### Analytics Menu
- **Access**: Reece only (user ID: 391415444084490240)
- **Visibility**: Ephemeral
- **Location**: `app.js` - `createReeceStuffMenu()`
- **Purpose**: Server analytics, admin tools, danger zone
- **Accent Color**: Blue (0x3498DB)

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
- **Production Menu**: Players, Tribes, Pronouns & Timezones
- **Submenus**: Individual management screens
- **Back Target**: Production Menu

### Analytics & Admin
- **Production Menu**: Analytics (Reece only), Setup
- **Submenus**: Analytics Menu (Reece only)
- **Back Target**: Production Menu

---

## Recent Changes

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
