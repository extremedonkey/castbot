# 0954 - Item-Triggered Custom Actions

**Date:** 2026-03-03 (updated 2026-03-04)
**Status:** Design — ready to build
**Affects:** Custom Actions, Inventory, Action Visibility UI, Action Editor UI

---

## Original Context (Trigger Prompt)

> Add the ability to link a custom action to an existing item from within the Location menu of a custom action. This should be exposed via a button such as Link to Item.
>
> When a user is viewing a custom item or an item in their inventory, show a Use button. When the user selects Use: if the item is linked to only one action, execute that action immediately. If the item is linked to multiple actions, open a modal that allows the user to choose which action they want to perform. When the modal is submitted, execute the selected action.
>
> Item consumption rules: If the item is consumable, remove 1 of that item from the user's inventory after the action is successfully executed. If the item is multi-use, execute the linked custom action using its configured multi-use behaviour instead of treating it as a one-time consumable.

**Subsequent refinements** (user follow-up):
- Use existing item picker pattern (`safari_manage_items` → `entity_select_item`) with search
- Only valid when action trigger type is `button`
- Use String Select (not modal Radio Group) for multi-action items
- Options order: `⚔️ Attack Player` → `⚡ Replenish Stamina` → `⚡ CustomActionNames`
- Hard cap 20 uses per item, enforced in creation UI
- Rename editor header: `⚡ Action Editor | <Name>`
- Rename `⚡ Custom Actions` → `⚡ Actions` (`safari_action_editor`)
- Rename locations section: `Button Locations (Where players can click it)`
- Summary line shows all trigger surfaces, not just coordinates
- Apply LEAN design standards to Action Visibility screen
- Add accent colors to Action Visibility (user's choice) and Trigger Config (blue-ish)
- "Recipes" in summary = Crafting menu visibility
- Stamina dispatch from String Select: call existing handler (not inline)
- Consumption rules tied to sub-action usage limits, not just consumable flag

---

## The Problem (Plain English)

Custom Actions are powerful — they can give items, modify attributes, run calculations, chain into follow-ups. But the only way a player can trigger them is:
1. Clicking a button anchored to a **map coordinate**, or
2. Clicking a button in the **Player Menu** or **Crafting Menu**

Meanwhile, items sit in the player's inventory as inert objects. Consumables can only boost stamina. Attack items can only attack. There's no way to say *"when a player uses this Healing Potion, run the Healing Spell custom action"*.

This is like having a fully-stocked toolbox but only being able to use the tools when you're standing in a specific room. Players should be able to use items wherever they are — the item IS the trigger.

---

## Architecture

### Data Model: Single Source of Truth

```
safariContent[guildId].buttons[actionId].linkedItems = ["itemId1", "itemId2"]
```

**Why action-side, not item-side:**
- Actions already own their trigger config (coordinates, menu visibility, trigger type)
- `linkedItems` is just another trigger surface — like `coordinates` but for inventory
- Avoids bidirectional sync (the coordinates/buttons sync is already a maintenance tax)
- Reverse lookup is cheap: scan `Object.values(buttons)` for `linkedItems.includes(itemId)`
- Future-proof: when we add "⚡ Assign Action" from the item UI, it writes to the same field

**Why NOT bidirectional:**
- The `coordinates ↔ location.buttons` bidirectional sync already exists and is fragile
- Adding another sync pair (action.linkedItems ↔ item.linkedActions) doubles the maintenance
- Runtime scan of ~50-200 actions is <1ms — no performance concern

### Reverse Lookup Function

```javascript
function getLinkedActions(guildId, itemId, safariData) {
  const actions = safariData[guildId]?.buttons || {};
  return Object.values(actions).filter(a =>
    a.linkedItems?.includes(itemId) &&
    a.trigger?.type === 'button'  // Only button-triggered actions can be item-triggered
  );
}
```

### Trigger Type Constraint

Item-triggered actions **must** have `trigger.type === 'button'`. Rationale:
- The item "Use" is effectively a button press — same execution path
- Text commands/modals/scheduled actions don't make sense from inventory context
- The Action Visibility screen conditionally shows/hides the "📦 Item Action" button based on trigger type

---

## Inventory Button Display Logic

This is the core decision matrix. An item's available "uses" are the combination of its intrinsic properties (attack, stamina) and any linked custom actions.

### Counting Uses

```javascript
const uses = [];
if (item.attackValue > 0) uses.push({ type: 'attack', label: '⚔️ Attack Player' });
if (item.consumable === 'Yes' && item.staminaBoost > 0) uses.push({ type: 'stamina', label: `⚡ Replenish Stamina (+${item.staminaBoost})` });
for (const action of getLinkedActions(guildId, itemId, safariData)) {
  uses.push({ type: 'custom_action', actionId: action.id, label: `⚡ ${action.name}` });
}
```

### Display Rules

| Total uses | Composition | Component shown | Custom ID |
|-----------|-------------|-----------------|-----------|
| 0 | Nothing | No button (text-only) | — |
| 1 | Attack only | Green button: `⚔️ Attack Player` | `safari_attack_player_{itemId}` (existing) |
| 1 | Stamina only | Green button: `Use (+X ⚡)` | `safari_use_item_{itemId}` (existing) |
| 1 | Custom action only | Grey button: `⚡ Use` | `safari_use_linked_{itemId}` (**new**) → direct execute |
| 2+ | Any combination | Grey select: `📦 Use Item` | `safari_item_uses_{itemId}` (**new**) → String Select |

### String Select Option Order (2+ uses)

```
1. ⚔️ Attack Player              (if attackValue > 0)
2. ⚡ Replenish Stamina (+X)     (if consumable + staminaBoost)
3. ⚡ [Custom Action Name 1]     (linked actions, sorted by name)
4. ⚡ [Custom Action Name 2]
...
N. ⚡ [Custom Action Name N]     (hard cap: 20 total options)
```

**String Select values:**
- `attack` → routes to existing `safari_attack_player_{itemId}` flow
- `stamina` → routes to existing `safari_use_item_{itemId}` flow
- `action_{actionId}` → routes to `executeButtonActions()`

### Hard Cap: 20

- Enforced in the Action Visibility UI when linking items (prevent linking if item already has 20 uses)
- String Select can hold 25 options, but 20 is a sane UX limit
- Count includes attack + stamina + all custom actions across all linked actions

---

## UI Changes — Screen by Screen

### 1. Action Editor Header (cosmetic)

**File:** `customActionUI.js` → `createCustomActionEditorUI()` (line 366)

| Before | After |
|--------|-------|
| `## ⚡ Custom Action Editor - Healing Spell` | `## ⚡ Action Editor \| Healing Spell` |

### 2. Button Locations Summary (in Action Editor)

**File:** `customActionUI.js` → `createCustomActionEditorUI()` (line 412-428)

| Before | After |
|--------|-------|
| `Assigned Locations (Adds button to coordinate anchor)` | `**Button Locations** (Where players can click it)` |
| `A1, B2` or `0 coordinates` | `A1, B2; Player Menu; 2 items` or `No locations` |

**Summary line construction:**

```javascript
function formatButtonLocations(action) {
  const parts = [];

  // Coordinates (existing format)
  const coords = action.coordinates || [];
  if (coords.length > 0) {
    const sorted = [...coords].sort();
    const coordStr = sorted.length <= 4
      ? sorted.join(', ')
      : `${sorted.slice(0, 3).join(', ')}… +${sorted.length - 3}`;
    parts.push(coordStr);
  }

  // Menu visibility
  const visibility = action.menuVisibility || 'none';
  if (visibility === 'player_menu') parts.push('Player Menu');
  if (visibility === 'crafting_menu') parts.push('Crafting');

  // Linked items
  const items = action.linkedItems || [];
  if (items.length > 0) {
    parts.push(`${items.length} item${items.length > 1 ? 's' : ''}`);
  }

  return parts.length > 0 ? parts.join('; ') : 'No locations';
}
```

### 3. Action Visibility Screen (LEAN redesign)

**File:** `customActionUI.js` → `createCoordinateManagementUI()` (line 1391-1530)

**Current** (verbose, no accent):
```
## 📍 Action Visibility

**Action:** Healing Spell

Control where this action appears:     ← delete this line
──────
### 📋 Menu Visibility                 ← verbose section header
[Hidden / Player Menu / Crafting ▼]
──────
### 📍 Map Locations (3)               ← verbose section header
📍 A1 — Beach Cove        [🗑️]
📍 B2 — Dark Forest       [🗑️]
──────
[← Back] [📍 Add Coord] [# Post]
```

**Proposed** (LEAN, accented, with items section):
```
## 📍 Action Visibility | Healing Spell
──────
> **`📋 Menu`**
[Hidden / Player Menu / Crafting ▼]
──────
> **`🗺️ Map Locations (2)`**
📍 A1                     [🗑️]
📍 B2                     [🗑️]
──────
> **`📦 Items Using Action (1)`**                    ◄◄◄ NEW
🧪 Healing Potion                                   ◄◄◄ NEW
Restores health when con..                           ◄◄◄ NEW
                                       [🗑️]         ◄◄◄ NEW
──────
[← Back] [📍 Add Coord] [# Post] [📦 Item Action]  ◄◄◄ 4th button NEW
```

**Accent color:** `0x5865F2` (Discord blurple — matches the "configuration" feel)

**Key changes from current:**
- Delete `Control where this action appears:` text
- Add action name to header: `## 📍 Action Visibility | {name}`
- Use LEAN section headers: `> **\`📋 Menu\`**` instead of `### 📋 Menu Visibility`
- Add `📦 Items Using Action (X)` section with items listed as Sections + Remove buttons
- Add 4th button `📦 Item Action` to bottom ActionRow
- `📦 Item Action` button **hidden** when `action.trigger.type !== 'button'`
- Add Container accent color

**Item Section — per-item display:**

```javascript
// Each linked item as a Section with Remove accessory
{
  type: 9, // Section
  components: [{
    type: 10,
    content: `${item.emoji || '📦'} **${item.name}**\n${truncate(item.description, 48)}`
  }],
  accessory: {
    type: 2, // Button
    custom_id: `ca_unlink_item_${actionId}_${itemId}`,
    label: "Remove",
    style: 4, // Danger
    emoji: { name: "🗑️" }
  }
}
```

### 4. Item Picker Sub-UI (reuses existing pattern)

**Triggered by:** `📦 Item Action` button (`ca_linked_items_{actionId}`)

**Reuses:** `createEntityManagementUI({ entityType: 'item', ... })` or extracts the entity selector component from `entityManagementUI.js`.

The existing item picker (`entity_select_item`) already provides:
- Full item list with emoji + name + description
- Search (`search_entities` → `entity_search_modal_item`)
- 25-option limit with smart truncation
- "Back to all" from search results

**Difference from standard entity management:** We don't need create/edit/delete — just selection. So we either:
- **Option A:** Reuse `createEntityManagementUI()` but override the "Create New" option to not appear, and on selection write to `action.linkedItems` instead of opening the editor
- **Option B:** Extract `createEntitySelector()` from `entityManagementUI.js` and build a lighter wrapper

**Recommendation: Option B** — lighter, purpose-built. The `createEntitySelector()` function (entityManagementUI.js:250-331) is already exported and can be called directly. We wrap it in a simple Container:

```javascript
async function createItemLinkUI({ guildId, actionId, searchTerm }) {
  const safariData = await loadSafariContent();
  const items = safariData[guildId]?.items || {};
  const action = safariData[guildId]?.buttons?.[actionId];
  const linkedItems = action?.linkedItems || [];

  // Filter out already-linked items from main list, show them separately
  const availableItems = Object.fromEntries(
    Object.entries(items).filter(([id]) => !linkedItems.includes(id))
  );

  const selector = createEntitySelector(availableItems, null, 'item', searchTerm);
  // Override custom_id to our own handler
  selector.components[0].custom_id = `ca_link_item_select_${actionId}`;
  // Remove "Create New" option
  selector.components[0].options = selector.components[0].options.filter(
    o => o.value !== 'create_new'
  );

  return {
    flags: (1 << 15),
    components: [{
      type: 17,
      accent_color: 0x5865F2,
      components: [
        { type: 10, content: `## 🔗 Link Item | ${action.name}` },
        { type: 14 },
        { type: 10, content: `Select an item to link to this action.\nPlayers with this item will see a **⚡ Use** button.` },
        selector,
        { type: 14 },
        { type: 1, components: [{
          type: 2,
          custom_id: `entity_action_coords_${actionId}`,
          label: '← Back',
          style: 2
        }]}
      ]
    }]
  };
}
```

### 5. Trigger Configuration Screen (cosmetic)

**File:** `customActionUI.js` — trigger config UI

**Change:** Add accent color `0x3498DB` (blue) to the Container.

### 6. Player Inventory Display

**File:** `safariManager.js` → `createPlayerInventoryDisplay()` (line 3880)

**Change:** After calculating item properties, also call `getLinkedActions()`. Use the display rules matrix above to decide which button/select to render:

```javascript
// Current: only checks attackValue and consumable+staminaBoost
// New: also checks linked actions
const linkedActions = getLinkedActions(guildId, itemId, safariData);
const uses = [];
if (item.attackValue > 0) uses.push({ type: 'attack' });
if (item.consumable === 'Yes' && item.staminaBoost > 0) uses.push({ type: 'stamina' });
linkedActions.forEach(a => uses.push({ type: 'action', id: a.id, name: a.name }));

if (uses.length === 1 && uses[0].type === 'attack') {
  // Existing attack button (unchanged)
} else if (uses.length === 1 && uses[0].type === 'stamina') {
  // Existing stamina button (unchanged)
} else if (uses.length === 1 && uses[0].type === 'action') {
  // NEW: Single custom action — grey ⚡ Use button, direct execute
  accessory = { type: 2, custom_id: `safari_use_linked_${itemId}`, label: 'Use', style: 2, emoji: { name: '⚡' } };
} else if (uses.length >= 2) {
  // NEW: Multiple uses — 📦 String Select
  // Rendered as ActionRow with String Select after the text display
  // (Section accessory can't be a select — need ActionRow instead)
}
```

**Component consideration for multi-use items:** A Section's accessory can only be a Button. For items with 2+ uses needing a String Select, we need to use a different layout:

```
Text Display: item info + "📦 Multiple uses available"
ActionRow: String Select with use options
```

This costs 1 extra component per multi-use item vs the Section+accessory pattern. Inventory already budgets 10 items/page — should be fine within 40-component limit since multi-use items are the minority.

---

## New Button/Handler Registration

### New Button IDs

| ID | Type | Handler | BUTTON_REGISTRY |
|----|------|---------|-----------------|
| `ca_linked_items_{actionId}` | Button | Opens item link sub-UI | `{ label: 'Item Action', emoji: '📦', category: 'custom_actions' }` |
| `ca_link_item_select_{actionId}` | String Select | Links selected item to action | `{ label: 'Link Item Select', category: 'custom_actions' }` |
| `ca_unlink_item_{actionId}_{itemId}` | Button | Removes item link | `{ label: 'Unlink Item', emoji: '🗑️', category: 'custom_actions' }` |
| `safari_use_linked_{itemId}` | Button | Executes single linked action | `{ label: 'Use Item Action', emoji: '⚡', category: 'safari' }` |
| `safari_item_uses_{itemId}` | String Select | Dispatches to attack/stamina/action | `{ label: 'Item Uses Select', emoji: '📦', category: 'safari' }` |

### Existing Handlers — Changes

| ID | Change |
|----|--------|
| `entity_action_coords_{actionId}` | **UI only** — `createCoordinateManagementUI()` gets items section + 4th button + LEAN redesign + accent |
| `safari_player_inventory` | **UI only** — `createPlayerInventoryDisplay()` adds ⚡/📦 components |
| `safari_inv_page_{userId}_{pageNum}` | **UI only** — same display function |

### Existing Handlers — Untouched

| ID | Reason |
|----|--------|
| `safari_use_item_{itemId}` | Stays for pure stamina. If item also has linked actions, routed through `safari_item_uses_` select instead. |
| `safari_attack_player_{itemId}` | Stays for pure attack. If item also has linked actions, routed through `safari_item_uses_` select. |
| `entity_select_item` | Existing item selector — we extract its component builder but don't modify its handler. |
| `safari_manage_items` | Existing item management entry — untouched. |
| `menu_visibility_select_{actionId}` | Menu visibility select — untouched. |
| `remove_coord_{actionId}_{coord}` | Coordinate removal — untouched. |

---

## Execution Flow

### Single Custom Action (direct execute)

```
Player clicks ⚡ Use (safari_use_linked_{itemId})
  │
  ├─ ButtonHandlerFactory.create({ deferred: true })
  │
  ├─ getLinkedActions(guildId, itemId) → [action]
  │
  ├─ executeButtonActions(guildId, action.id, userId, interactionData)
  │   (existing function — no changes)
  │
  ├─ if execution succeeded:
  │   └─ consumeItemAfterAction(guildId, userId, itemId, item)
  │       ├─ item.consumable === 'Yes' → quantity -= 1 (delete if 0)
  │       └─ else → no consumption (permanent item)
  │
  └─ return action result + remaining quantity
```

### Multi-Use Item (String Select dispatch)

```
Player selects from 📦 Use Item (safari_item_uses_{itemId})
  │
  ├─ value === 'attack'
  │   └─ route to createAttackPlanningUI() (existing attack flow)
  │
  ├─ value === 'stamina'
  │   └─ route to stamina consumption (existing safari_use_item flow)
  │
  └─ value === 'action_{actionId}'
      └─ same as single custom action flow above
```

### Item Consumption Logic

```javascript
async function consumeItemAfterAction(guildId, userId, itemId, item, playerData) {
  if (item.consumable !== 'Yes') return; // Permanent items aren't consumed

  const player = playerData[guildId]?.players?.[userId];
  const inventory = player?.safari?.inventory;
  if (!inventory?.[itemId]) return;

  const currentQty = getItemQuantity(inventory[itemId]);
  if (currentQty <= 1) {
    delete inventory[itemId];
  } else {
    setItemQuantity(inventory, itemId, currentQty - 1);
  }

  await savePlayerData(playerData);
}
```

**Multi-use items:** The user mentioned "multi-use configuration." Currently items have:
- `consumable: "Yes"/"No"` — whether the item is consumed on use
- `maxQuantity: -1/N` — max a player can hold

For item-triggered actions, the rule is simple:
- `consumable === "Yes"` → decrement by 1 after successful action execution
- `consumable === "No"` → don't consume (item is permanent, can be used repeatedly)

No new fields needed. The existing consumable flag already captures this.

---

## Component Budget Analysis

### Action Visibility Screen (worst case)

| Component | Count |
|-----------|-------|
| Header text (## 📍 Action Visibility \| Name) | 1 |
| Separator | 1 |
| `> **📋 Menu**` section header | 1 |
| ActionRow + StringSelect (menu visibility) | 2 |
| Separator | 1 |
| `> **🗺️ Map Locations (N)**` section header | 1 |
| N coordinate Sections (Section + Text + Accessory) | N × 3 |
| Separator | 1 |
| `> **📦 Items Using Action (M)**` section header | 1 |
| M item Sections (Section + Text + Accessory) | M × 3 |
| Separator | 1 |
| ActionRow + 4 buttons | 5 |
| **Base total** | **16 + 3N + 3M** |

| Scenario | N coords | M items | Total | Status |
|----------|----------|---------|-------|--------|
| Empty | 0 | 0 | 16 | OK |
| Typical | 3 | 2 | 31 | OK |
| Heavy | 5 | 3 | 40 | At limit |
| Over | 6 | 3 | 43 | Over! |

**Mitigation:** If `3N + 3M > 24` (i.e., total entries > 8), collapse items section to summary text: `📦 3 items linked (use 📦 Item Action to manage)`.

### Player Inventory (10 items/page)

Most items use Section + Text + Accessory = 3 components. Multi-use items with String Select use Text + ActionRow + Select = 3 components. Same budget either way. The inventory already handles 10 items/page within the 40-component limit — linked actions don't increase the component count per item.

---

## Entity Edit Framework Relevance

Reviewed `docs/enablers/EntityEditFramework.md`. Key takeaways:

**What we reuse:**
- `createEntitySelector()` from `entityManagementUI.js` — the item picker dropdown with search
- Entity search modal pattern (`entity_search_modal_item`)
- `loadEntities()` / `loadEntity()` from `entityManager.js` for loading items

**What we DON'T need:**
- Full CRUD framework — we're only selecting existing items, not creating/editing/deleting
- `EditInterfaceBuilder` / `PropertiesEditor` — too heavy for a link/unlink operation
- `EDIT_CONFIGS` extension — no new entity type needed

**Future: Enemies as entity type.** The user mentioned enemies who might use items. If enemies become an entity type:
- They'd have an `inventory` or `loadout` field listing item IDs
- The same `getLinkedActions()` lookup would work for enemy item usage
- The item picker UI could be reused for assigning items to enemies
- No architectural changes needed now — just don't hardcode "player" assumptions in the new consumption logic

**Future: Item-side action assignment.** The user mentioned `⚡ Assign Action` from the item editor UI. When implemented:
- Same data write target: `safariContent.buttons[actionId].linkedItems`
- Show a String Select of custom actions (filtered to `trigger.type === 'button'`)
- On selection, add `itemId` to the selected action's `linkedItems` array
- No new data model — just a different UI entry point to the same field

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Component budget overflow on Action Visibility screen | Medium | Collapse to summary text when >8 total entries |
| Inventory display regression (existing attack/stamina buttons) | Medium | Leave existing button handlers untouched; new logic only adds, never replaces |
| `getLinkedActions()` scan performance with many actions | Low | Scan is O(N) where N ≈ 50-200 actions, <1ms. Cache if needed later. |
| Item deleted while linked to action | Low | `getLinkedActions()` filters by items that still exist in `safariData.items`. Stale IDs in `linkedItems` are harmless — render skips them. |
| Action deleted while linked to item | Low | `getLinkedActions()` only returns existing actions. Orphan itemIds in deleted action data don't matter — action is gone. |
| Multi-use String Select component budget in inventory | Low | String Select costs same as Section+Accessory (3 components). No net increase. |
| Stamina refactoring breaks existing flow | Medium | Don't refactor stamina handler. Multi-use select dispatches to existing stamina code path unchanged. |

---

## Implementation Order

1. **Data model** — Add `linkedItems: []` to action creation defaults in `customActionUI.js`
2. **`getLinkedActions()`** — Utility function in `safariManager.js`
3. **Action Editor header rename** — Cosmetic, `customActionUI.js:366`
4. **Button Locations summary** — `formatButtonLocations()` helper, update Section text
5. **Action Visibility LEAN redesign** — `createCoordinateManagementUI()` overhaul with accent, section headers, items section, 4th button, conditional on trigger type
6. **Item Link sub-UI** — `createItemLinkUI()` using extracted entity selector
7. **Link/Unlink handlers** — `ca_linked_items_`, `ca_link_item_select_`, `ca_unlink_item_` in app.js
8. **Inventory display** — `createPlayerInventoryDisplay()` adds ⚡ Use button and 📦 String Select
9. **Use handlers** — `safari_use_linked_` (direct execute), `safari_item_uses_` (select dispatch)
10. **Consumption logic** — `consumeItemAfterAction()` in safariManager.js
11. **Trigger Config accent** — Cosmetic, add blue accent to trigger config Container
12. **BUTTON_REGISTRY** — Register all new buttons
13. **Dynamic patterns** — Add new wildcard patterns to `dynamicPatterns` in app.js

---

## Files Changed

| File | Changes |
|------|---------|
| `customActionUI.js` | Header rename, `formatButtonLocations()`, `createCoordinateManagementUI()` LEAN redesign + items section, `createItemLinkUI()`, trigger config accent |
| `safariManager.js` | `getLinkedActions()`, inventory display logic, `consumeItemAfterAction()` |
| `app.js` | 5 new button/select handlers, dynamic patterns list |
| `buttonHandlerFactory.js` | BUTTON_REGISTRY entries for new buttons |

---

## Open Questions

1. **"Recipes" in summary line** — User mentioned `[X recipes]` in the Button Locations summary. Is this the Crafting Menu visibility, or a future feature? Currently interpreting `crafting_menu` visibility as "Crafting" in the summary.

2. **Stamina in multi-use select** — When dispatching `value === 'stamina'` from the String Select, should we inline the stamina consumption logic (copy from existing handler) or call the existing handler? Inlining is safer (no refactoring risk) but duplicates ~15 lines.

3. **Action conditions + item consumption** — Proposed: check conditions via `executeButtonActions()` first, only consume item if execution succeeds. The existing `executeButtonActions()` already handles condition evaluation and returns results. If conditions fail, the "false" branch actions execute (if any) but we still don't consume the item — or do we?

---

Related: [CastlistV3 Pre-Launch Tweaks](../temp/castlistV3PreLaunchTweaks.md)
Docs: [SafariCustomActions](../03-features/SafariCustomActions.md) | [EntityEditFramework](../enablers/EntityEditFramework.md)
