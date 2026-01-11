# Crafting Menu Actions Analysis

**RaP Number:** 0961
**Date:** 2026-01-11
**Status:** Design Phase
**Related:** [PlayerMenuActions.md](../docs/features/PlayerMenuActions.md)

---

## Original Context

> From the Coordinate Management screen, change the "Hide" / "Show" button to a String Select with options:
> 1. Don't show in any menu
> 2. Show in Player Menu (existing)
> 3. Show in crafting menu (new)
>
> CRAFTING FEATURE - IF the server has at least one Action set to 'Show in crafting menu' THEN show a 🛠️ 'Crafting' button in **Player Menu**, prioritised ahead of playerMenu Custom Actions.
> On click, show a new menu with all crafting actions.

---

## Problem Statement

The Player Menu Actions feature allows Custom Actions to appear in the player's `/menu`. Now we need to:

1. **Extend the visibility system** to support multiple menu destinations (not just on/off)
2. **Add a Crafting Menu** - a dedicated interface for crafting-type actions
3. **Place Crafting button in Player Inventory** - accessible from the inventory screen

---

## Design Options

### Option A: Multi-Select Approach (NOT RECOMMENDED)

Allow actions to appear in **multiple** menus simultaneously.

```javascript
// Data structure
action.menuVisibility = ['player_menu', 'crafting_menu']  // Array
```

**Pros:**
- Maximum flexibility
- Action could appear in both menus

**Cons:**
- UI complexity (checkboxes needed)
- Confusing UX - "Why does my Heal spell appear twice?"
- Component budget eaten by same action in multiple places

### Option B: Single-Select Enum (RECOMMENDED)

Each action appears in **exactly one** menu location (or none).

```javascript
// Data structure - migrate from boolean to enum
action.menuVisibility = 'none' | 'player_menu' | 'crafting_menu'

// Backward compatibility
if (action.showInInventory === true && !action.menuVisibility) {
  action.menuVisibility = 'player_menu';
}
```

**Pros:**
- Clean UX - one dropdown, one choice
- Clear mental model for users
- No duplicate actions across menus
- Easy to add more options later (e.g., 'shop_menu', 'battle_menu')

**Cons:**
- Can't have action in multiple menus (acceptable trade-off)

---

## Recommended Design

### 1. Data Structure Migration

```javascript
// Current (Player Menu Actions feature)
action.showInInventory = true/false

// New
action.menuVisibility = 'none' | 'player_menu' | 'crafting_menu'

// Default
action.menuVisibility = action.menuVisibility ||
  (action.showInInventory ? 'player_menu' : 'none')
```

### 2. UI Components

#### 2.1 Coordinate Management Screen - String Select

Replace the current Show/Hide button with a String Select:

```
┌─────────────────────────────────────────────────┐
│ 📋 Menu Visibility                              │
│ Choose where this action appears for players    │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ ▼ 🚫 Hidden (Not in any menu)              │ │
│ │   📋 Player Menu (Quick Access)            │ │
│ │   🛠️ Crafting Menu                         │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Select Options:**

| Value | Label | Emoji | Description |
|-------|-------|-------|-------------|
| `none` | Hidden | 🚫 | Only at map locations |
| `player_menu` | Player Menu | 📋 | Quick access from /menu |
| `crafting_menu` | Crafting | 🛠️ | Appears in Crafting menu |

#### 2.2 Player Inventory - Crafting Button

When at least one action has `menuVisibility: 'crafting_menu'`:

```
┌─────────────────────────────────────────────────┐
│ 🎒 Your Inventory                               │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ 🍎 Apple x3                                     │
│ ⚔️ Sword x1                                     │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ [🛠️ Crafting] [📋 Heal] [📋 Teleport]         │
│ [← Back]                                        │
└─────────────────────────────────────────────────┘
```

**Button Priority Order:**
1. 🛠️ Crafting button (if crafting actions exist) - **FIRST**
2. 📋 Player Menu actions (existing feature)
3. ← Back button (always last)

#### 2.3 Crafting Menu

New dedicated menu for crafting actions:

```
┌─────────────────────────────────────────────────┐
│ ## 🛠️ Crafting                                  │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ > **`⚒️ Recipes`**                             │
│ [🗡️ Craft Sword] [🛡️ Craft Shield] [🏹 Bow]   │
│ [⚗️ Potion] [🔮 Enchant]                       │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ [← Inventory]                                   │
└─────────────────────────────────────────────────┘
```

**LEAN Design Notes:**
- Single Container with accent color `0xE67E22` (orange/craft)
- Section header using quote + backtick pattern
- Action buttons in rows of 5 (Discord limit)
- Budget-based rendering (same as Player Menu)
- Back button returns to Inventory

---

## Implementation Flow

```mermaid
flowchart TB
    subgraph Admin["Admin Configuration"]
        A[Coordinate Management UI] --> B{Menu Visibility Select}
        B -->|none| C[Hidden - Map only]
        B -->|player_menu| D[Shows in Player Menu]
        B -->|crafting_menu| E[Shows in Crafting Menu]
    end

    subgraph Player["Player Experience"]
        F[/menu] --> G[Player Menu]
        G --> H{Has player_menu actions?}
        H -->|Yes| I[Show action buttons]

        J[Inventory Button] --> K[Player Inventory]
        K --> L{Has crafting_menu actions?}
        L -->|Yes| M[Show 🛠️ Crafting button]
        L -->|No| N[No crafting button]

        M --> O[Crafting Menu]
        O --> P[Show crafting action buttons]
    end

    style E fill:#f90,color:#000
    style M fill:#f90,color:#000
    style O fill:#f90,color:#000
```

---

## Technical Specification

### Files to Modify

| File | Changes |
|------|---------|
| `customActionUI.js` | Replace button with String Select in `createCoordinateManagementUI()` |
| `safariManager.js` | Add Crafting button to `createPlayerInventoryDisplay()` |
| `safariManager.js` | Create `createCraftingMenuUI()` function |
| `app.js` | Add `menu_visibility_select_*` handler |
| `app.js` | Add `safari_crafting_menu_*` button handler |
| `buttonHandlerFactory.js` | Register new buttons |
| `playerManagement.js` | Update filter from `showInInventory` to `menuVisibility === 'player_menu'` |

### Button Registry Additions

```javascript
// Coordinate Management - Select menu
'menu_visibility_select_*': {
  label: 'Menu Visibility',
  description: 'Select where action appears in menus',
  emoji: '📋',
  category: 'safari_management'
},

// Player Inventory - Crafting button
'safari_crafting_menu_*': {
  label: 'Crafting Menu',
  description: 'Open crafting menu for player',
  emoji: '🛠️',
  style: 'Primary',
  category: 'safari_player'
},

// Crafting Menu - Back button
'crafting_back_inventory_*': {
  label: 'Back to Inventory',
  description: 'Return to player inventory',
  emoji: null,  // No emoji for back buttons per LEAN standards
  style: 'Secondary',
  category: 'safari_player'
}
```

### Data Migration

```javascript
// In loadSafariContent() or on first access
function migrateMenuVisibility(action) {
  if (action.menuVisibility === undefined) {
    // Migrate from old boolean field
    action.menuVisibility = action.showInInventory ? 'player_menu' : 'none';
  }
  return action;
}
```

---

## Component Budget Analysis

### Player Inventory Budget

Current inventory structure + new crafting button:

| Component | Type | Count |
|-----------|------|-------|
| Container | 17 | 1 |
| Title Text | 10 | 1 |
| Separator | 14 | 1-2 |
| Item list (Section) | 9 | ~5-10 |
| Action Row (Crafting + actions) | 1 | 1-2 |
| Buttons | 2 | 2-10 |
| **Estimated Total** | | **15-25** |

**Budget remaining for actions:** ~15-20 components (safe margin)

### Crafting Menu Budget

Dedicated menu with simpler structure:

| Component | Type | Count |
|-----------|------|-------|
| Container | 17 | 1 |
| Header Text | 10 | 1 |
| Separator | 14 | 1 |
| Section Header | 10 | 1 |
| Action Rows | 1 | 2-4 |
| Buttons | 2 | 5-20 |
| **Estimated Total** | | **12-28** |

**Capacity:** Up to 20 crafting actions safely

---

## Edge Cases

### 1. No Crafting Actions Configured
- Crafting button simply doesn't appear in Inventory
- No error, no empty menu

### 2. Too Many Crafting Actions
- Apply same budget logic as Player Menu
- Cap at 10-15 actions maximum
- Show warning in Admin UI if >10 actions configured

### 3. Action Has Location Requirements
- Same caveat as Player Menu Actions
- Actions with `AT_LOCATION` conditions will fail from menu
- Document in feature guide

### 4. Migration - Existing showInInventory Actions
- Automatically migrate `showInInventory: true` → `menuVisibility: 'player_menu'`
- Preserve existing functionality
- Clean migration path

---

## Admin Warning System

When configuring menu visibility, show warnings:

```javascript
// In Coordinate Management UI
if (craftingActionCount >= 10) {
  // Show warning text
  content += `\n\n⚠️ **Warning:** ${craftingActionCount} actions in Crafting menu. Some may not display due to Discord limits.`;
}
```

---

## UX Refinements

### Select Menu Descriptions

```javascript
const options = [
  {
    label: 'Hidden',
    value: 'none',
    description: 'Only available at map locations',
    emoji: { name: '🚫' },
    default: currentVisibility === 'none'
  },
  {
    label: 'Player Menu',
    value: 'player_menu',
    description: 'Quick access from /menu → My Profile',
    emoji: { name: '📋' },
    default: currentVisibility === 'player_menu'
  },
  {
    label: 'Crafting',
    value: 'crafting_menu',
    description: 'Appears in Crafting menu from Inventory',
    emoji: { name: '🛠️' },
    default: currentVisibility === 'crafting_menu'
  }
];
```

### Crafting Menu Header Options

**Option A - Simple:**
```
## 🛠️ Crafting
```

**Option B - Contextual (RECOMMENDED):**
```
## 🛠️ Crafting | {serverName}
```

**Option C - Item-aware (future):**
```
## 🛠️ Crafting | 3 recipes available
```

---

## Alternative Label Considerations

| Current | Alternative 1 | Alternative 2 | Recommendation |
|---------|--------------|---------------|----------------|
| Hidden | None | Not Shown | **Hidden** (clear) |
| Player Menu | Quick Access | My Profile | **Player Menu** (consistent) |
| Crafting | Workshop | Recipes | **Crafting** (intuitive) |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data migration breaks existing actions | Low | High | Test migration on dev first |
| Component budget exceeded | Low | Medium | Use same budget logic as Player Menu |
| User confusion about menu locations | Low | Low | Good descriptions in select menu |
| Crafting button clutters Inventory | Low | Low | Only shows if crafting actions exist |

---

## Implementation Order

1. **Phase 1: Data Migration** (15 min)
   - Add `menuVisibility` field handling
   - Backward compatibility for `showInInventory`

2. **Phase 2: String Select UI** (30 min)
   - Replace button with select in Coordinate Management
   - Add select handler in app.js

3. **Phase 3: Crafting Menu** (45 min)
   - Create `createCraftingMenuUI()` function
   - Add Crafting button to Inventory
   - Add menu handler

4. **Phase 4: Update Player Menu** (10 min)
   - Change filter from `showInInventory` to `menuVisibility === 'player_menu'`

5. **Phase 5: Testing & Polish** (20 min)
   - Test migration
   - Test all visibility options
   - Test crafting menu flow

---

## TLDR Summary

**What:** Extend Custom Action visibility from on/off toggle to 3-option select (Hidden / Player Menu / Crafting)

**Key Changes:**
1. **String Select** replaces Show/Hide button in Coordinate Management
2. **New `menuVisibility` field** - enum instead of boolean (`'none'` | `'player_menu'` | `'crafting_menu'`)
3. **Crafting button** appears in Player Inventory when crafting actions configured
4. **New Crafting Menu** - dedicated UI showing all crafting actions
5. **Backward compatible** - existing `showInInventory: true` migrates to `menuVisibility: 'player_menu'`

**Button Priority in Inventory:** 🛠️ Crafting → 📋 Player Menu Actions → ← Back

**Recommendation:** Option B (Single-Select Enum) - clean UX, easy migration, extensible for future menu types.

**Estimated Effort:** ~2 hours total implementation

---

*Prepared for: Player Menu Actions extension*
*Follows: [PlayerMenuActions.md](../docs/features/PlayerMenuActions.md)*
