# Item-Linked Custom Actions - UI Mockups & Button IDs

## Overview

Three UI touchpoints need changes:
1. **Coordinate Management Screen** (admin) - Add "Link Item" button to existing ActionRow
2. **Player Inventory** (player) - Add "Use" button on items with linked actions
3. **Action Selection Modal** (player) - Choose which action when item has multiple links

---

## Existing Button ID Map (what we hang off)

```
ADMIN SIDE — Custom Action Location/Trigger Screen
══════════════════════════════════════════════════════════════

entity_action_coords_{actionId}                app.js:26089 / customActionUI.js:1391
│  "📍 Action Visibility" screen (coordinates + menu visibility)
│  Called: createCoordinateManagementUI({ guildId, actionId })
│
│  CURRENT SCREEN STRUCTURE:
│  ┌─────────────────────────────────────────────────┐
│  │  📍 Action Visibility                           │
│  │  ─────────────────────                          │
│  │  Menu Visibility: [Hidden ▼]                    │  ← menu_visibility_select_{actionId}
│  │  ─────────────────────                          │
│  │  🗺️ Map Locations (3)                           │
│  │  📍 A1 — Beach          [🗑️]                   │  ← remove_coord_{actionId}_{coord}
│  │  📍 B2 — Forest         [🗑️]                   │
│  │  📍 C3 — Cave           [🗑️]                   │
│  │  ─────────────────────                          │
│  │  [← Back] [📌 Add Coord] [# Post to Channel]   │  ← bottom ActionRow (3 buttons)
│  │   ▲          ▲                ▲                 │
│  │   custom_    add_coord_       entity_action_    │
│  │   action_    modal_           post_channel_     │
│  │   editor_    {actionId}       {actionId}        │
│  │   {actionId}                                    │
│  └─────────────────────────────────────────────────┘
│
│  ► WE ADD: 4th button "🔗 Link Item" to bottom ActionRow
│  ► WE ADD: Linked items list section (between coords and bottom buttons)
│
├── menu_visibility_select_{actionId}    customActionUI.js:1445
│   String select: Hidden / Player Menu / Crafting (unchanged)
│
├── remove_coord_{actionId}_{coordinate} customActionUI.js:1478
│   Per-coordinate delete button (unchanged)
│
├── custom_action_editor_{actionId}      (← Back button, unchanged)
│
├── add_coord_modal_{actionId}           (Add Coordinate modal, unchanged)
│
├── entity_action_post_channel_{actionId} (Post to Channel, unchanged)
│
└── ► NEW: ca_linked_items_{actionId}
    (🔗 Link Item — opens item selection sub-UI)


PLAYER SIDE — Inventory
══════════════════════════════════════════════════════════════

safari_player_inventory                     app.js:11777
│  Opens player inventory page 0
│  Called: createPlayerInventoryDisplay(guildId, userId, member, 0)
│  Factory: updateMessage: true
│  ► WE MODIFY: This function to add "Use" buttons on linked items
│
├── safari_inv_page_{userId}_{pageNum}      app.js:23353
│   Pagination — same display function, different page
│   ► ALSO MODIFIED: Same createPlayerInventoryDisplay change
│
├── safari_use_item_{itemId}                app.js:11834
│   Existing "Use" for consumable+staminaBoost items
│   ► UNTOUCHED — pure stamina items keep this button
│
├── safari_attack_player_{itemId}           app.js:11803
│   Existing "Attack" for weapon items
│   ► UNTOUCHED
│
└── ► NEW: safari_use_linked_{itemId}
    "▶ Use" button on items with linked action(s)
    Routes to: immediate execute (1 action) or modal (2+ actions)
```

---

## 1. Coordinate Management Screen — Add "Link Item" Button + Section

**Parent button:** `entity_action_coords_{actionId}` (app.js:26089)
**UI function:** `createCoordinateManagementUI()` (customActionUI.js:1391)
**Current bottom ActionRow:** 3 buttons → we add a 4th (max 5 per row, so fine)

### Updated screen:

```
┌──────────────────────────────────────────────────────┐
│  📍 Action Visibility                                │
│  ──────────────────────                              │
│  Where can this action be triggered?                 │
│                                                      │
│  Menu Visibility:                                    │
│  ┌──────────────────────────────────┐                │
│  │ ▼  Hidden (not in player menu)  │                │  ← menu_visibility_select_{actionId}
│  └──────────────────────────────────┘                │    (existing, unchanged)
│  ──────────────────────                              │
│  🗺️ Map Locations (3)                                │
│                                                      │
│  📍 A1 — Beach Cove                        [🗑️]     │  ← remove_coord_{actionId}_A1
│  📍 B2 — Dark Forest                       [🗑️]     │  ← remove_coord_{actionId}_B2
│  📍 C3 — Crystal Cave                      [🗑️]     │  ← remove_coord_{actionId}_C3
│  ──────────────────────                              │
│  🔗 Linked Items (2)                        ◄◄◄ NEW │
│                                                      │
│  🧪 Healing Potion (consumable)             [🗑️]    │  ← ca_unlink_item_{actionId}_{itemId}
│  🗡️ Enchanted Sword                        [🗑️]    │  ← ca_unlink_item_{actionId}_{itemId}
│  ──────────────────────                              │
│  [← Back] [📌 Add Coord] [# Post] [🔗 Link Item]   │
│   ▲          ▲              ▲          ▲             │
│   custom_    add_coord_     entity_    ca_linked_    │
│   action_    modal_         action_    items_        │
│   editor_    {actionId}     post_ch_   {actionId}   │
│   {actionId}                {actionId}   ◄◄◄ NEW   │
└──────────────────────────────────────────────────────┘
```

### Component budget (worst case — 6 coords + 3 linked items):

| Component | Count |
|-----------|-------|
| Header text | 1 |
| Separator | 1 |
| Menu visibility text | 1 |
| ActionRow + StringSelect | 2 |
| Separator | 1 |
| Map header text | 1 |
| 6 coord Sections (Section + Text + Button) | 18 |
| Separator | 1 |
| Linked Items header text | 1 |
| 3 item Sections (Section + Text + Button) | 9 |
| Separator | 1 |
| ActionRow + 4 buttons | 5 |
| **Total** | **42** |

Close to the 40 limit with many entries. Mitigation: cap the inline display at ~4 items, show "and N more..." text for the rest. Or paginate the sub-screen.

### "Link Item" button press (`ca_linked_items_{actionId}`) → Item Selection sub-UI:

```
┌──────────────────────────────────────────────────────┐
│  🔗 Link Item to: Healing Spell                     │
├──────────────────────────────────────────────────────┤
│  Select an item to link to this action.              │
│  Players with this item in their inventory will      │
│  see a "Use" button.                                 │
│                                                      │
│  ┌────────────────────────────────────────────┐      │
│  │ ▼ Choose an item...                        │      │  ← ca_link_item_select_{actionId}
│  ├────────────────────────────────────────────┤      │
│  │ 🧪 Healing Potion     (consumable)         │      │
│  │ 🗡️ Enchanted Sword    (permanent)          │      │
│  │ 📦 Mystery Box         (consumable)         │      │
│  │ ── Already linked ──                        │      │
│  │ ✅ Mana Crystal        (linked)             │      │
│  └────────────────────────────────────────────┘      │
│                                                      │
│  [ ← Back ]                                         │
│    ▲                                                 │
│    entity_action_coords_{actionId}  (existing)       │
└──────────────────────────────────────────────────────┘
```

---

## 2. Player Inventory — "Use" Button on Linked Items

**Parent button:** `safari_player_inventory` (app.js:11777)
**UI function:** `createPlayerInventoryDisplay()` (safariManager.js:3880)
**Also rendered by:** `safari_inv_page_{userId}_{pageNum}` (app.js:23353)

### Current item rendering (unchanged items for reference):

```
Attack item  → Section with accessory: safari_attack_player_{itemId}     (unchanged)
Consumable   → Section with accessory: safari_use_item_{itemId}          (unchanged)
Regular      → Text Display only (no button)                             (unchanged)
```

### New rendering — items with linked actions:

```
┌──────────────────────────────────────────────────────┐
│  🎒 Your Inventory                    Page 1/3       │
│           ▲                                          │
│           safari_player_inventory (opens this)       │
│           safari_inv_page_{userId}_{page} (paginates)│
├──────────────────────────────────────────────────────┤
│  🧪 Healing Potion (x5)                             │
│  Restores health  ⚡+10                              │
│  🔮 Brew Potion, Heal Ally                          │  ← hint: linked action names
│                                   [ ▶ Use ]          │  ← safari_use_linked_{itemId}
│                                                      │
│  Replaces safari_use_item_ for items that have       │
│  BOTH stamina AND linked actions. Pure stamina       │
│  items keep safari_use_item_ unchanged.              │
├──────────────────────────────────────────────────────┤
│  🗡️ Enchanted Sword (x1)                            │
│  A magical blade  ⚔️ 15                              │
│  🔮 Power Strike, Enchant                           │  ← hint: linked action names
│         [ ⚔️ Attack Player ] [ ▶ Use ]               │
│           ▲                     ▲                    │
│  safari_attack_player_{itemId}  safari_use_linked_   │
│  (existing, unchanged)          {itemId} (NEW)       │
│                                                      │
│  Attack items with linked actions get BOTH buttons   │
│  in an ActionRow.                                    │
├──────────────────────────────────────────────────────┤
│  📦 Mystery Box (x3)                                │
│  Who knows what's inside?                            │
│  🔮 Open Box                                        │  ← hint
│                                   [ ▶ Use ]          │  ← safari_use_linked_{itemId}
│                                                      │
│  Regular item promoted to Section with accessory     │
│  because it has a linked action.                     │
├──────────────────────────────────────────────────────┤
│  🛡️ Iron Shield (x2)                                │
│  Sturdy protection                                   │
│  (no linked actions = no button, still text-only)    │
├──────────────────────────────────────────────────────┤
│  [ 1 ]  [ 2 ]  [ 3 ]                                │  ← safari_inv_page_{userId}_{n}
└──────────────────────────────────────────────────────┘
```

### Button decision matrix:

| Item has... | Linked actions? | Button(s) shown |
|-------------|-----------------|-----------------|
| staminaBoost only | No | `safari_use_item_{itemId}` (existing, unchanged) |
| staminaBoost only | Yes | `safari_use_linked_{itemId}` (NEW — handles both stamina + linked) |
| attackValue only | No | `safari_attack_player_{itemId}` (existing, unchanged) |
| attackValue only | Yes | `safari_attack_player_{itemId}` + `safari_use_linked_{itemId}` (both) |
| neither | No | No button (text only) |
| neither | Yes | `safari_use_linked_{itemId}` (NEW) |

---

## 3a. Single Linked Action → Immediate Execution

When `safari_use_linked_{itemId}` is pressed and the item has exactly **one** linked action:

```
User clicks [ ▶ Use ] on "Mystery Box"
    ↓
safari_use_linked_{itemId} handler (NEW, in app.js)
    ↓
getLinkedActions(guildId, itemId) → 1 action: "open_box_482916"
    ↓
executeButtonActions(guildId, "open_box_482916", userId, interactionData)
    ↓  (existing function, safariManager.js:1512, unchanged)
Action executes → results shown
    ↓
consumeItemAfterAction() → quantity 3 → 2
```

**Response (updates the inventory message):**
```
┌──────────────────────────────────────────────────────┐
│  ✅ You used Mystery Box!                            │
│                                                      │
│  📦 Open Box result:                                 │
│  You found a 🗡️ Rusty Dagger!                       │
│                                                      │
│  📦 Mystery Box remaining: 2                         │
│                                                      │
│  [ ← Back to Inventory ]                             │
│    ▲                                                 │
│    safari_player_inventory (existing)                │
└──────────────────────────────────────────────────────┘
```

---

## 3b. Multiple Linked Actions → Selection Modal

When `safari_use_linked_{itemId}` is pressed and the item has **2+** linked actions:

```
┌─────────────────────────────────────────────────────────┐
│                  Use: Enchanted Sword                    │
│                  ▲                                       │
│                  ca_action_choice_{itemId} (modal ID)    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Choose an action:          ← Label (type 18)           │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  ○  ⚔️ Power Strike    ← Radio Group (type 21)   │  │
│  │     Deal 2x damage to target                      │  │
│  │                                                   │  │
│  │  ○  🛡️ Defensive Stance                          │  │
│  │     Gain +5 defense for 1 round                   │  │
│  │                                                   │  │
│  │  ○  ✨ Enchant Ally                               │  │
│  │     Grant ally +3 attack                          │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Radio option values = actionId strings                  │
│                                                         │
│              [ Cancel ]    [ ✅ Submit ]    (built-in)   │
└─────────────────────────────────────────────────────────┘

Modal submit → same custom_id: ca_action_choice_{itemId}
Extract selected actionId from radio group value
→ executeButtonActions() → consumeItemAfterAction()
```

---

## Data Structure Changes

### On the Custom Action (safariContent.buttons[actionId])

```javascript
{
  id: "healing_spell_482916",
  name: "Healing Spell",
  // ... existing fields (trigger, conditions, coordinates, actions, etc.) ...

  // NEW FIELD
  linkedItems: ["healing_potion_id", "mana_crystal_id"]  // Array of item IDs
}
```

### No changes to item structure needed

Reverse lookup (item → actions) derived at runtime:
```javascript
function getLinkedActions(guildId, itemId, safariData) {
  const actions = safariData[guildId]?.buttons || {};
  return Object.values(actions).filter(a =>
    a.linkedItems?.includes(itemId)
  );
}
```

Single source of truth on the action side. No sync issues.

---

## Complete Button ID Reference

### New Button IDs

| Button ID | Type | Parent UI | Purpose |
|-----------|------|-----------|---------|
| `ca_linked_items_{actionId}` | Button | Coordinate Mgmt screen (`entity_action_coords_{actionId}`) bottom ActionRow | Opens item selection sub-UI |
| `ca_link_item_select_{actionId}` | String Select | Item selection sub-UI | Dropdown of items to link |
| `ca_unlink_item_{actionId}_{itemId}` | Button | Coordinate Mgmt screen, linked items section | Remove specific item link |
| `safari_use_linked_{itemId}` | Button | Player Inventory (`createPlayerInventoryDisplay`) | "Use" button — triggers linked action(s) |
| `ca_action_choice_{itemId}` | Modal + Submit | Triggered by `safari_use_linked_` when 2+ actions | Radio group to choose which action |

### Existing — UI Modified (handler unchanged)

| Button ID | File:Line | What Changes |
|-----------|-----------|--------------|
| `entity_action_coords_{actionId}` | customActionUI.js:1391 | **UI change only:** `createCoordinateManagementUI()` gets new "Linked Items" section + 4th button in bottom ActionRow |
| `safari_player_inventory` | app.js:11777 | **No handler change.** `createPlayerInventoryDisplay()` adds `safari_use_linked_` buttons |
| `safari_inv_page_{userId}_{pageNum}` | app.js:23353 | **Same** — calls same display function |

### Existing — Completely Untouched

| Button ID | File:Line | Why |
|-----------|-----------|-----|
| `safari_use_item_{itemId}` | app.js:11834 | Pure stamina items keep their own button |
| `safari_attack_player_{itemId}` | app.js:11803 | Attack is independent; "Use" added alongside |
| `safari_crafting_menu_{guildId}_{userId}` | app.js:26273 | Out of scope |
| `menu_visibility_select_{actionId}` | customActionUI.js:1445 | Menu visibility unchanged |
| `remove_coord_{actionId}_{coord}` | customActionUI.js:1478 | Coord removal unchanged |
| `add_coord_modal_{actionId}` | customActionUI.js | Add coord modal unchanged |
| `entity_action_post_channel_{actionId}` | customActionUI.js | Post to channel unchanged |
| `custom_action_editor_{actionId}` | customActionUI.js | Back button unchanged |

---

## Functions to Modify

| Function | File | Change |
|----------|------|--------|
| `createCoordinateManagementUI()` | customActionUI.js:1391 | Add "Linked Items" section + "Link Item" button to bottom ActionRow |
| `createPlayerInventoryDisplay()` | safariManager.js:3880 | Add "▶ Use" accessory button for items that have linked actions |

## Functions to Create

| Function | File | Purpose |
|----------|------|---------|
| `getLinkedActions(guildId, itemId)` | safariManager.js | Reverse lookup: item → all actions linking to it |
| `createLinkItemUI(guildId, actionId)` | customActionUI.js | Sub-UI with string select of available items |
| `handleItemUseAction(guildId, userId, itemId)` | safariManager.js | Orchestrate: lookup → execute or modal → consume |
| `createActionSelectionModal(itemId, actions)` | safariManager.js | Build modal with radio group for multi-action choice |
| `consumeItemAfterAction(guildId, userId, itemId)` | safariManager.js | Post-execution: decrement consumable or apply multi-use logic |

---

## Execution Flow

```
Player clicks [▶ Use] on item in inventory
  safari_use_linked_{itemId}               ◄ NEW handler in app.js
         │
         ▼
  getLinkedActions(guildId, itemId)         ◄ NEW function in safariManager.js
  (scans safariContent.buttons for actions whose linkedItems includes itemId)
         │
         ├── 0 actions → "This item can't be used" (shouldn't happen - button hidden)
         │
         ├── 1 action → Execute immediately
         │         │
         │         ▼
         │   executeButtonActions(...)       ◄ EXISTING (safariManager.js:1512)
         │         │
         │         ▼
         │   consumeItemAfterAction(...)     ◄ NEW
         │     ├── item.consumable === "Yes" → quantity -= 1
         │     └── multi-use → respect item config
         │
         └── 2+ actions → Show selection modal
                   │
                   ▼
             ca_action_choice_{itemId}       ◄ NEW modal (Radio Group type 21)
                   │
                   ▼
             Modal submit handler            ◄ NEW handler in app.js
             (extracts selected actionId from radio value)
                   │
                   ▼
             executeButtonActions(...)        ◄ EXISTING
                   │
                   ▼
             consumeItemAfterAction(...)      ◄ NEW
```

---

## Open Questions for Technical Plan

1. **Unified vs separate "Use" button**: Should items with BOTH stamina boost AND linked actions show one button or two? (Mockup assumes unified — linked replaces stamina for those items)
2. **Multi-use items**: What does "multi-use configuration" look like? Is this the existing `maxQuantity` field, or do we need a new `usesPerItem` field?
3. **Action conditions**: If a linked action has conditions (e.g., "must have 100 gold"), should we check conditions BEFORE consuming the item? (Recommended: yes — conditions checked by `executeButtonActions`, item only consumed on success)
4. **Cooldowns**: Should item-linked actions respect the same cooldown system as location-triggered actions?
5. **Activity logging**: Should item uses be logged to the Safari activity log? (Recommended: yes)
6. **Screen rename**: You mentioned renaming "Location" since it now covers coords + items + menu visibility. Want to settle on a name before implementation? (Candidates: "Triggers", "Availability", "Where & How")
