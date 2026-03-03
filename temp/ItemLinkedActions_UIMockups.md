# Item-Triggered Custom Actions - UI Mockups

**RaP:** [0954_20260303_ItemTriggeredActions_Analysis.md](../docs/01-RaP/0954_20260303_ItemTriggeredActions_Analysis.md)

---

## Journey 1: Admin Creates an Action & Links It to an Item

| Step | Screen Title | User Clicks | Button ID | Next Screen |
|------|-------------|-------------|-----------|-------------|
| 1 | — | `/menu` slash command | — | Production Menu |
| 2 | `## CastBot \| Production Menu` | `⚡ Actions` button | `safari_action_editor` | Custom Actions list |
| 3 | `## ⚡ Custom Actions` | `➕ Create New Custom Action` from dropdown | `entity_custom_action_list_global` (select, value: `create_new`) | Modal |
| 4 | Modal: **Create Custom Action** | Fills in name/description, submits | `global_create_modal_safari_button_info` | Action Editor |
| 5 | `## ⚡ Action Editor \| Healing Spell` | Configures trigger (must be "button"), conditions, action steps | (various) | stays on editor |
| 6 | `## ⚡ Action Editor \| Healing Spell` | `📍 Manage` button (Button Locations section) | `entity_action_coords_{actionId}` | Action Visibility |
| 7 | `## 📍 Action Visibility \| Healing Spell` | `📦 Item Action` button (bottom ActionRow) | `ca_linked_items_{actionId}` **NEW** | Item Link sub-UI |
| 8 | `## 🔗 Link Item \| Healing Spell` | Selects item from dropdown (with search) | `ca_link_item_select_{actionId}` **NEW** | Returns to Action Visibility |
| 9 | `## 📍 Action Visibility \| Healing Spell` | Item now listed under `📦 Items Using Action (1)` | — | Done |

---

### Step 5: Action Editor (renamed)

```
┌─────────────────────────────────────────────────────────┐
│  ## ⚡ Action Editor | Healing Spell            ◄ RENAMED
│  ──────────────────────                                 │
│  📝 Action Info                                         │
│  ──────────────────────                                 │
│  🚀 Trigger: Button                          [Manage]  │
│  ──────────────────────                                 │
│  🧩 Conditions: 2 set                        [Manage]  │
│  ──────────────────────                                 │
│  **Button Locations** (Where players can click it)      │ ◄ RENAMED
│  A1, B2; Player Menu; 1 item                            │ ◄ EXPANDED SUMMARY
│                                               [Manage]  │
│    ▲                                             ▲      │
│    entity_action_coords_{actionId}                      │
│  ──────────────────────                                 │
│  ✅ Actions if Conditions Met (3/8)                     │
│  ...                                                    │
└─────────────────────────────────────────────────────────┘
```

**Summary line examples:**
- `A1, B2; Player Menu; 2 items` — has coords, player menu, linked items
- `A1; Crafting` — coords + crafting menu
- `Player Menu; 1 item` — no coords, just menu + item
- `No locations` — nothing configured

---

### Step 7: Action Visibility (LEAN redesign)

**Accent:** `0x5865F2` (Discord blurple)
**`📦 Item Action` button only visible when `trigger.type === 'button'`**

```
┌ accent: 0x5865F2 ──────────────────────────────────────┐
│  ## 📍 Action Visibility | Healing Spell                │
│  ──────────────────────                                 │
│  > **`📋 Menu`**                                       │
│  ┌──────────────────────────────────────┐               │
│  │ ▼ Hidden (not in player menu)       │               │  ← menu_visibility_select_{actionId}
│  └──────────────────────────────────────┘               │
│  ──────────────────────                                 │
│  > **`🗺️ Map Locations (2)`**                          │
│                                                         │
│  📍 A1                                       [🗑️]      │  ← remove_coord_{actionId}_A1
│  📍 B2                                       [🗑️]      │  ← remove_coord_{actionId}_B2
│  ──────────────────────                                 │
│  > **`📦 Items Using Action (1)`**            ◄◄◄ NEW  │
│                                                         │
│  🧪 **Healing Potion**                       [🗑️]      │  ← ca_unlink_item_{actionId}_{itemId}
│  Restores health when con..                             │     (48 char truncation)
│  ──────────────────────                                 │
│  [← Back] [📍 Add Coord] [# Post] [📦 Item Action]    │
│   ▲          ▲              ▲          ▲         NEW ► │
│   custom_    add_coord_     entity_    ca_linked_       │
│   action_    modal_         action_    items_            │
│   editor_    {actionId}     post_ch_   {actionId}       │
│   {actionId}                {actionId}                  │
└─────────────────────────────────────────────────────────┘
```

**When `trigger.type !== 'button'`** — the `📦 Item Action` button is hidden (3 buttons in ActionRow instead of 4). The items section still renders if items were previously linked, with a note: *"⚠️ Item triggers disabled — action trigger type must be Button"*

---

### Step 8: Item Link Sub-UI

**Reuses:** `createEntitySelector()` from `entityManagementUI.js` (proven item picker with search)

```
┌ accent: 0x5865F2 ──────────────────────────────────────┐
│  ## 🔗 Link Item | Healing Spell                       │
│  ──────────────────────                                 │
│  Select an item to link to this action.                 │
│  Players with this item will see a **⚡ Use** button.   │
│                                                         │
│  ┌────────────────────────────────────────────┐         │
│  │ ▼ Select an item...                        │         │ ← ca_link_item_select_{actionId}
│  ├────────────────────────────────────────────┤         │
│  │ 🔍 Search: "Type to search..."             │         │   (reuses entity search pattern)
│  │ 🧪 Healing Potion     (consumable)         │         │
│  │ 🗡️ Enchanted Sword    (permanent)          │         │
│  │ 📦 Mystery Box         (consumable)         │         │
│  │ ── Already linked (greyed) ──               │         │   (if item in action.linkedItems)
│  │ ✅ Mana Crystal                             │         │
│  └────────────────────────────────────────────┘         │
│  ──────────────────────                                 │
│  [← Back]                                              │
│    ▲                                                    │
│    entity_action_coords_{actionId} (back to visibility) │
└─────────────────────────────────────────────────────────┘
```

---

## Journey 2: Player Uses an Item (Single Use — Custom Action)

**Applies when:** Item has exactly 1 available use AND that use is a linked custom action
(no attack value, no stamina boost — or those don't exist)

| Step | Screen Title | User Clicks | Button ID |
|------|-------------|-------------|-----------|
| 1 | — | `/menu` | — |
| 2 | `## CastBot \| Player Menu` | `🧰 Inventory` | `safari_player_inventory` |
| 3 | `## 🎒 Your Inventory` | `⚡ Use` button (grey) on item | `safari_use_linked_{itemId}` **NEW** |
| 4 | Action executes, result shown | `← Back to Inventory` | `safari_player_inventory` |

### Inventory with single-use custom action item:

```
┌──────────────────────────────────────────────────────┐
│  🎒 Your Inventory                    Page 1/3       │
├──────────────────────────────────────────────────────┤
│  📦 Mystery Box (x3)                                │
│  Who knows what's inside?                            │
│                                   [ ⚡ Use ]         │ ← safari_use_linked_{itemId}
│                                     grey/Secondary   │    (1 linked action, no attack/stamina)
├──────────────────────────────────────────────────────┤
│  🧪 Healing Potion (x5)                             │
│  Restores health  ⚡+10                              │
│                              [ Use (+10 ⚡) ]        │ ← safari_use_item_{itemId}
│                                                      │    (pure stamina, no linked actions
│                                                      │     — UNCHANGED)
├──────────────────────────────────────────────────────┤
│  🗡️ Raider's Blade (x1)                             │
│  A deadly weapon  ⚔️ 15                              │
│                              [ ⚔️ Attack Player ]    │ ← safari_attack_player_{itemId}
│                                                      │    (pure attack, no linked actions
│                                                      │     — UNCHANGED)
├──────────────────────────────────────────────────────┤
│  🛡️ Iron Shield (x2)                                │
│  Sturdy protection                                   │ ← no button (no uses at all)
└──────────────────────────────────────────────────────┘
```

---

## Journey 3: Player Uses an Item (Multiple Uses — String Select)

**Applies when:** Item has 2+ available uses (any combination of attack + stamina + custom actions)

| Step | Screen Title | User Clicks | Button ID |
|------|-------------|-------------|-----------|
| 1 | — | `/menu` | — |
| 2 | `## CastBot \| Player Menu` | `🧰 Inventory` | `safari_player_inventory` |
| 3 | `## 🎒 Your Inventory` | Selects from `📦 Use Item` dropdown | `safari_item_uses_{itemId}` **NEW** |
| 4a | (if attack selected) | Attack planning UI | routes to existing attack flow |
| 4b | (if stamina selected) | Stamina consumed | routes to existing stamina flow |
| 4c | (if custom action selected) | Action executes, result shown | `executeButtonActions()` |

### Inventory with multi-use item:

```
┌──────────────────────────────────────────────────────┐
│  🎒 Your Inventory                    Page 1/3       │
├──────────────────────────────────────────────────────┤
│  🗡️ Enchanted Sword (x1)                            │
│  A magical blade  ⚔️ 15  ⚡+5                        │
│  📦 Multiple uses available                          │
│  ┌────────────────────────────────────────────┐      │
│  │ ▼ 📦 Use Item...                          │      │ ← safari_item_uses_{itemId}
│  ├────────────────────────────────────────────┤      │
│  │ ⚔️ Attack Player                          │      │   value: "attack"
│  │ ⚡ Replenish Stamina (+5)                  │      │   value: "stamina"
│  │ ⚡ Power Strike                            │      │   value: "action_{actionId1}"
│  │ ⚡ Enchant Ally                            │      │   value: "action_{actionId2}"
│  │ ⚡ Defensive Stance                        │      │   value: "action_{actionId3}"
│  └────────────────────────────────────────────┘      │
├──────────────────────────────────────────────────────┤
│  📦 Mystery Box (x3)                                │
│  Who knows what's inside?                            │
│                                   [ ⚡ Use ]         │ ← safari_use_linked_{itemId}
│                                                      │    (single custom action only)
├──────────────────────────────────────────────────────┤
│  🧪 Healing Potion (x5)                             │
│  Restores health  ⚡+10                              │
│                              [ Use (+10 ⚡) ]        │ ← safari_use_item_{itemId}
│                                                      │    (pure stamina — unchanged)
└──────────────────────────────────────────────────────┘
```

**String Select options (ordered):**

```
1. ⚔️ Attack Player              (if item.attackValue > 0)
2. ⚡ Replenish Stamina (+X)     (if item.consumable === 'Yes' && item.staminaBoost > 0)
3. ⚡ [Custom Action Name 1]     (linked actions, sorted by name)
4. ⚡ [Custom Action Name 2]
...                               (hard cap: 20 total options)
```

---

## Button Display Decision Matrix

| Item properties | Linked actions? | Total uses | Component | Custom ID |
|----------------|-----------------|------------|-----------|-----------|
| No attack, no stamina | 0 | 0 | No button | — |
| Attack only | 0 | 1 | Button (green) | `safari_attack_player_{itemId}` (existing) |
| Stamina only | 0 | 1 | Button (green) | `safari_use_item_{itemId}` (existing) |
| No attack, no stamina | 1 | 1 | Button (grey, ⚡) | `safari_use_linked_{itemId}` (**new**) |
| Any combo | — | 2+ | String Select (📦) | `safari_item_uses_{itemId}` (**new**) |

**Key rule:** Existing `safari_attack_player_` and `safari_use_item_` handlers are **never modified**. They only render when the item has exactly 1 use of that type. As soon as an item has 2+ total uses, everything goes through the String Select.

---

## Complete New Button ID Reference

| ID Pattern | Type | Parent | Purpose |
|------------|------|--------|---------|
| `ca_linked_items_{actionId}` | Button | Action Visibility bottom row | Opens item link sub-UI |
| `ca_link_item_select_{actionId}` | String Select | Item link sub-UI | Pick item to link |
| `ca_unlink_item_{actionId}_{itemId}` | Button | Action Visibility items section | Remove item link |
| `safari_use_linked_{itemId}` | Button | Player Inventory | Direct-execute single linked action |
| `safari_item_uses_{itemId}` | String Select | Player Inventory | Multi-use dispatch (attack/stamina/actions) |
