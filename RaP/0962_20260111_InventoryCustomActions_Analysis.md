# Inventory Custom Actions: Design Analysis

## Original Context (Trigger Prompt)

> I'd like the ability to add Custom Action(s) to a player's Inventory and be used from there.
>
> Architecturally, I suspect this may be tricky as the current design works on a purely per-location basis.
>
> I'd like the ability to toggle whether a custom action appears in a player's menu from here [the Coordinate Management UI - entity_action_coords]

---

## Problem Statement

The current Custom Actions system is **location-centric** - actions are assigned to map coordinates and appear as buttons on location anchor messages or are triggered via text commands when at specific locations.

The request is to allow Custom Actions to also appear in a player's **Inventory**, creating "usable items" or "abilities" that players can trigger from their inventory view regardless of location.

---

## Current Architecture Analysis

### How Custom Actions Are Currently Assigned

```
┌─────────────────────────────────────────────────────────────────┐
│                   CURRENT LOCATION-CENTRIC MODEL                 │
└─────────────────────────────────────────────────────────────────┘

safariData[guildId].buttons = {
  "action_id_123": {
    id: "action_id_123",
    name: "Treasure Chest",
    trigger: { type: "button", ... },

    coordinates: ["B3", "C4"],  // ← Location assignment ONLY

    actions: [...]
  }
}

┌─────────────────┐     ┌─────────────────┐
│ Custom Action   │────▶│   Coordinates   │
│ "action_id_123" │     │   ["B3", "C4"]  │
└─────────────────┘     └─────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Location Anchors    │
                    │ (Buttons appear on  │
                    │  map channel msgs)  │
                    └─────────────────────┘
```

### Current Coordinate Management UI

Located at `customActionUI.js:1131` - `createCoordinateManagementUI()`:

```javascript
// Current structure - ONLY manages location coordinates
const components = [
  { type: 10, content: `## 📍 Coordinate Management\n\n**Action:** ${action.name}` },
  { type: 14 },

  // List of assigned coordinates with remove buttons
  ...coordinates.map(coord => ({
    type: 9, // Section
    components: [{ type: 10, content: `**${coord}**` }],
    accessory: {
      type: 2,
      custom_id: `remove_coord_${actionId}_${coord}`,
      label: "Remove",
      style: 4
    }
  })),

  // Add coordinate button
  { type: 1, components: [
    { custom_id: `add_coord_modal_${actionId}`, label: "Add Coordinate" }
  ]}
];
```

### Current Inventory Display

Located at `safariManager.js:3658` - `createPlayerInventoryDisplay()`:

The inventory currently shows:
- Player's currency balance
- List of owned items (with pagination)
- Attack buttons for offensive items
- Use buttons for consumable items (stamina boost)

**No Custom Action buttons currently exist in inventory.**

---

## Design Options

### Option A: Property on Custom Action (Recommended)

Add a new boolean field `showInInventory` to Custom Action data structure.

```javascript
safariData[guildId].buttons = {
  "action_id_123": {
    id: "action_id_123",
    name: "Healing Spell",

    // Existing fields
    coordinates: ["B3"],
    trigger: { type: "button", ... },
    actions: [...],

    // NEW FIELD
    showInInventory: true,  // Default: false

    // OPTIONAL: Additional inventory-specific config
    inventoryConfig: {
      buttonLabel: "Cast",           // Override button label in inventory
      buttonEmoji: "✨",             // Override emoji
      requiresItem: "spell_scroll",  // Optional: only show if player has this item
      consumesItem: true,            // Optional: consume the required item on use
      sortOrder: 1                   // Optional: ordering in inventory
    }
  }
}
```

**Pros:**
- Simple boolean toggle - minimal data structure change
- Easy to add to existing Coordinate Management UI
- Clear mental model: action can exist in 0+ locations AND/OR in inventory
- Backward compatible - existing actions default to `false`

**Cons:**
- Inventory can get cluttered if many actions are enabled
- Need to add filtering/sorting to inventory display

### Option B: Separate Inventory Actions Array

Add a new `inventoryActions` array at guild level (similar to `globalStores`).

```javascript
safariData[guildId] = {
  buttons: { ... },           // All Custom Actions
  globalStores: [...],        // Store IDs shown in /menu

  // NEW ARRAY
  inventoryActions: [         // Action IDs shown in inventory
    "action_id_123",
    "action_id_456"
  ]
}
```

**Pros:**
- Clear separation of concerns
- Easy to reorder inventory actions
- Follows existing `globalStores` pattern

**Cons:**
- Requires separate management UI (like Global Stores selector)
- Two places to manage action visibility
- Less discoverable from Action Editor

### Option C: Special "Inventory" Location

Treat "Inventory" as a virtual coordinate.

```javascript
coordinates: ["B3", "C4", "INVENTORY"]  // Special keyword
```

**Pros:**
- Uses existing coordinate system
- No new data structure needed
- Single management point

**Cons:**
- Mixes location coordinates with abstract concepts
- Could cause confusion
- Validation complexity

---

## Recommended Approach: Option A with UI Enhancement

### Data Structure Changes

```javascript
// In safariContent.json - Custom Action structure
{
  id: "action_id_123",
  name: "Healing Spell",
  // ... existing fields ...

  // NEW: Inventory visibility toggle (default false)
  showInInventory: false,

  // OPTIONAL FUTURE: Rich inventory config
  inventoryConfig: {
    buttonLabel: null,       // Uses action.trigger.button.label if null
    buttonEmoji: null,       // Uses action.trigger.button.emoji if null
    buttonStyle: null,       // Uses action.trigger.button.style if null
    sortOrder: 0,            // Ordering in inventory (lower = first)
    requiresItem: null,      // Item ID required to see/use this action
    consumesItem: false      // Whether to consume the required item
  }
}
```

### UI Changes Required

#### 1. Coordinate Management UI Enhancement

Modify `createCoordinateManagementUI()` in `customActionUI.js`:

```javascript
export async function createCoordinateManagementUI({ guildId, actionId }) {
  // ... existing code ...

  const components = [
    { type: 10, content: `## 📍 Action Visibility\n\n**Action:** ${action.name}` },
    { type: 14 },

    // NEW: Inventory toggle section
    {
      type: 9, // Section
      components: [{
        type: 10,
        content: action.showInInventory
          ? `**Player Inventory:** ✅ Visible`
          : `**Player Inventory:** ❌ Hidden`
      }],
      accessory: {
        type: 2,
        custom_id: `toggle_inventory_${actionId}`,
        label: action.showInInventory ? "Hide" : "Show",
        style: action.showInInventory ? 4 : 3, // Danger / Success
        emoji: { name: "🧰" }
      }
    },

    { type: 14 },

    // RENAMED: Map Locations section (existing coordinate logic)
    { type: 10, content: `### 📍 Map Locations (${coordinates.length})` },

    // ... existing coordinate sections ...
  ];
}
```

#### 2. Inventory Display Enhancement

Modify `createPlayerInventoryDisplay()` in `safariManager.js`:

```javascript
async function createPlayerInventoryDisplay(guildId, userId, member, currentPage) {
  // ... existing item display code ...

  // NEW: Add Custom Actions section if any are enabled for inventory
  const allActions = safariData[guildId]?.buttons || {};
  const inventoryActions = Object.values(allActions).filter(action =>
    action.showInInventory &&
    action.trigger?.type === 'button'  // Only button-triggered actions
  );

  if (inventoryActions.length > 0) {
    components.push({ type: 14 }); // Separator
    components.push({
      type: 10,
      content: `## ⚡ Actions`
    });

    // Create button rows (max 5 per row)
    const actionButtons = inventoryActions.map(action => ({
      type: 2,
      custom_id: `safari_${guildId}_${action.id}`,  // Reuse existing execution path
      label: action.inventoryConfig?.buttonLabel || action.trigger?.button?.label || action.name,
      style: getButtonStyleNumber(action.inventoryConfig?.buttonStyle || action.trigger?.button?.style),
      emoji: action.inventoryConfig?.buttonEmoji
        ? { name: action.inventoryConfig.buttonEmoji }
        : action.trigger?.button?.emoji
    }));

    // Split into rows of 5
    for (let i = 0; i < actionButtons.length; i += 5) {
      components.push({
        type: 1, // ActionRow
        components: actionButtons.slice(i, i + 5)
      });
    }
  }

  // ... existing pagination code ...
}
```

### Button Handler Changes

**No changes required!** The existing Safari Custom Action button handler at `app.js:4954` already handles buttons with format `safari_{guildId}_{actionId}`:

```javascript
if (custom_id.startsWith('safari_') &&
    !custom_id.startsWith('safari_store_') &&
    // ... other exclusions ...
) {
  // Uses ButtonHandlerFactory with deferred response
  // Calls executeButtonActions() which handles all Custom Action logic
  // This will work for inventory-triggered actions automatically!
}
```

---

## Implementation Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     NEW VISIBILITY MODEL                         │
└─────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │    Custom Action    │
                    │   "action_id_123"   │
                    └─────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
    ┌─────────────────┐  ┌─────────────┐  ┌─────────────────┐
    │  coordinates[]  │  │showInInventory │  │ Global Actions │
    │   ["B3", "C4"]  │  │    = true      │  │ (coordinates=[])│
    └────────┬────────┘  └───────┬───────┘  └────────┬────────┘
             │                   │                   │
             ▼                   ▼                   ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │ Location Anchor │  │ Player Inventory│  │ Enter Command   │
    │ Messages (B3,C4)│  │ (⚡ Actions)    │  │ (Text trigger)  │
    └─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## Component Count Analysis

### Inventory Display Budget

Current inventory uses ~15-25 components depending on items. Discord limit is 40.

**Adding 5 inventory actions (1 row):**
- Separator: 1
- Header text: 1
- ActionRow: 1
- Buttons (5): 5
- **Total added: 8 components**

**Adding 10 inventory actions (2 rows):**
- Separator: 1
- Header text: 1
- ActionRows (2): 2
- Buttons (10): 10
- **Total added: 14 components**

**Recommendation:** Limit inventory actions to 10 (2 rows) to stay safely within 40-component limit.

### Coordinate Management UI

Current: ~10-15 components. Adding inventory toggle adds only 1 Section (2 components including accessory).

---

## Edge Cases & Considerations

### 1. Condition Evaluation Context

When a Custom Action is triggered from inventory, there's no location context. The condition system needs to handle this:

```javascript
// In evaluateConditions - AT_LOCATION condition
case 'at_location':
  // If triggered from inventory, location is undefined
  // Should this fail the condition or skip it?
  const currentLocation = context.location || null;
  if (!currentLocation) {
    // Option A: Fail condition (most restrictive)
    return false;
    // Option B: Skip condition (most permissive)
    // return true;
  }
  return currentLocation === condition.targetLocation;
```

**Recommendation:** Fail location-based conditions when triggered from inventory. This makes sense semantically - if an action requires being at a location, it shouldn't work from inventory.

### 2. Usage Limits

Custom Actions with usage limits (`once_per_player`, `once_globally`) work the same way regardless of trigger source. No changes needed.

### 3. Follow-up Actions

If an inventory action triggers a follow-up action that's location-specific, what happens?

**Recommendation:** Follow-up actions should inherit the "no location" context. If the follow-up requires a location, it will fail gracefully.

### 4. Text/Modal Triggers

Only `button` trigger type makes sense for inventory display. Text/modal triggers require typing and don't fit the inventory UX.

```javascript
// Filter when building inventory actions
const inventoryActions = Object.values(allActions).filter(action =>
  action.showInInventory &&
  action.trigger?.type === 'button'  // ONLY button triggers
);
```

### 5. Item-Gated Actions (Future Enhancement)

An action could require the player to own a specific item to appear/be usable:

```javascript
inventoryConfig: {
  requiresItem: "spell_scroll",  // Only show if player has this item
  consumesItem: true             // Consume one spell_scroll when used
}
```

This creates "usable items" - the player buys a "Spell Scroll" item, and it unlocks the "Cast Spell" action in their inventory. Using the action consumes the scroll.

**This is a Phase 2 enhancement - not required for MVP.**

---

## Implementation Phases

### Phase 1: MVP (Recommended - 2-3 hours)

1. **Data Structure** - Add `showInInventory: boolean` to Custom Action schema
2. **Coordinate UI** - Add toggle button to Coordinate Management UI
3. **Toggle Handler** - Create `toggle_inventory_{actionId}` button handler
4. **Inventory Display** - Add "Actions" section to inventory when actions exist
5. **Testing** - Verify action execution works from inventory context

**Files to Modify:**
- `customActionUI.js` - Add toggle to coordinate management
- `safariManager.js` - Add actions section to inventory display
- `app.js` - Add toggle button handler
- `buttonHandlerFactory.js` - Register new button

### Phase 2: Polish (Optional - 1-2 hours)

1. **Custom button labels** - Allow override of button text in inventory
2. **Sort order** - Add sorting for inventory actions
3. **Maximum limit** - Enforce 10-action maximum with warning

### Phase 3: Advanced (Future)

1. **Item-gated actions** - Require ownership of specific item
2. **Consumable actions** - Use up an item when action triggers
3. **Cooldowns** - Per-action cooldowns for inventory actions

---

## Component Limit Handling (CRITICAL)

### Current State Analysis

The inventory display at `safariManager.js:3658` already has **basic** component limiting:

```javascript
// Current approach (lines 3837-3848) - SIMPLE COUNT
if (components.length + componentWeight + 1 > 32) {
  components.push({
    type: 10,
    content: `📦 **+${remainingItems} more items** (display limit reached)`
  });
  break;
}
```

**Problem:** This uses a flat count of `components.length`, not the recursive `countComponents()` function. Sections with accessories, action rows with buttons, etc. are counted as 1 but consume multiple component "slots" internally.

### Required Enhancement: Budget-Based Approach

When adding Custom Actions, implement a **budget-based** component allocation:

```javascript
async function createPlayerInventoryDisplay(guildId, userId, member, currentPage) {
  const DISCORD_LIMIT = 40;
  const SAFETY_BUFFER = 2;  // Leave headroom for edge cases
  const MAX_BUDGET = DISCORD_LIMIT - SAFETY_BUFFER;  // 38

  // Build base inventory components (header, balance, items)
  const baseComponents = buildBaseInventoryComponents(...);

  // Count actual components used by base inventory
  const baseCount = countComponents([{ type: 17, components: baseComponents }], {
    enableLogging: false
  });

  // Calculate remaining budget for Custom Actions
  const remainingBudget = MAX_BUDGET - baseCount;

  console.log(`📊 Component budget: ${baseCount} used, ${remainingBudget} remaining for actions`);

  // Only add Custom Actions if we have budget
  if (remainingBudget >= 4) {  // Need at least: separator + header + actionRow + 1 button
    const inventoryActions = getInventoryActions(guildId);

    // Calculate max actions we can fit
    // Each action row with 5 buttons = 6 components (1 row + 5 buttons)
    // Header section = 2 components (separator + text)
    const headerCost = 2;
    const perRowCost = 6;  // ActionRow + 5 buttons

    const availableForButtons = remainingBudget - headerCost;
    const maxRows = Math.floor(availableForButtons / perRowCost);
    const maxActions = Math.min(maxRows * 5, inventoryActions.length);

    if (maxActions > 0) {
      // Add actions section with truncation if needed
      baseComponents.push({ type: 14 });  // Separator
      baseComponents.push({
        type: 10,
        content: inventoryActions.length > maxActions
          ? `## ⚡ Actions (${maxActions} of ${inventoryActions.length})`
          : `## ⚡ Actions`
      });

      // Add action buttons (truncated to fit budget)
      const actionsToShow = inventoryActions.slice(0, maxActions);
      for (let i = 0; i < actionsToShow.length; i += 5) {
        baseComponents.push({
          type: 1,  // ActionRow
          components: actionsToShow.slice(i, i + 5).map(action => ({
            type: 2,
            custom_id: `safari_${guildId}_${action.id}`,
            label: action.trigger?.button?.label || action.name,
            style: getButtonStyleNumber(action.trigger?.button?.style),
            emoji: action.trigger?.button?.emoji
              ? { name: action.trigger.button.emoji }
              : undefined
          }))
        });
      }

      // Log if we had to truncate
      if (inventoryActions.length > maxActions) {
        console.log(`⚠️ Truncated inventory actions: showing ${maxActions}/${inventoryActions.length} (component limit)`);
      }
    }
  } else {
    console.log(`⚠️ No budget for inventory actions (${remainingBudget} remaining, need 4+)`);
  }

  // Final validation before returning
  const container = { type: 17, components: baseComponents };
  const finalCount = countComponents([container], {
    enableLogging: true,
    verbosity: "summary",
    label: "Player Inventory"
  });

  if (finalCount > DISCORD_LIMIT) {
    console.error(`🚨 CRITICAL: Inventory exceeded component limit: ${finalCount}/${DISCORD_LIMIT}`);
    // This should never happen with budget approach, but log for debugging
  }

  return { flags: (1 << 15), components: [container] };
}
```

### Logging Pattern (Following Castlist Example)

The castlist shows excellent component logging that we should follow:

```
1|castbot-pm  | 📋 /castlist - default:
1|castbot-pm  | 1. Container
1|castbot-pm  |   2. TextDisplay
1|castbot-pm  |   3. Section [HAS ACCESSORY]
1|castbot-pm  |      └─ Accessory: Thumbnail
...
1|castbot-pm  | ✅ Total components: 32/40
```

Implement similar logging for inventory:

```javascript
// At the end of createPlayerInventoryDisplay
countComponents([container], {
  enableLogging: true,
  verbosity: process.env.NODE_ENV === 'development' ? 'full' : 'summary',
  label: 'Player Inventory'
});
```

### Admin Warning in Toggle UI

When enabling inventory visibility, check component count:

```javascript
// In toggle_inventory handler
const allInventoryActions = Object.values(buttons).filter(a => a.showInInventory);

if (allInventoryActions.length >= 10) {
  // Add warning to response
  components.push({
    type: 10,
    content: `⚠️ **Warning:** ${allInventoryActions.length} actions enabled for inventory. ` +
             `Players with many items may not see all actions due to Discord's 40-component limit.`
  });
}
```

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Component limit exceeded | **High** | Budget-based allocation, `countComponents()` validation, truncation with message |
| Location conditions fail unexpectedly | Low | Document behavior, use "no location" context |
| Existing actions break | None | New field with default `false` - backward compatible |
| Inventory becomes cluttered | Low | Future: Add filtering, categories, or tabs |
| Performance impact | Low | Filtering is O(n) on buttons, typically <100 |
| Silent truncation confuses users | Medium | Show "(X of Y)" in header when truncated |

---

## Recommendation

**Implement Option A (Property on Custom Action) with Phase 1 scope.**

This approach:
- Minimizes data structure changes
- Reuses existing button execution infrastructure
- Provides clear admin UX (toggle in familiar Coordinate Management UI)
- Is fully backward compatible
- Can be extended to Phase 2/3 features later

The toggle should be named **"Player Inventory"** and placed **above** the coordinate list in the Coordinate Management UI, making it the first visibility option admins see.

---

## Summary

| Aspect | Current State | After Implementation |
|--------|--------------|----------------------|
| Action visibility | Location-only | Location + Inventory + Global |
| Inventory display | Items only | Items + Custom Actions section |
| Admin UI | Coordinate-only | Coordinates + Inventory toggle |
| Data structure | `coordinates[]` | `coordinates[]` + `showInInventory` |
| Execution path | No change needed | Reuses existing `safari_*` handler |

---

*Analysis Date: January 11, 2026*
*Related: [SafariCustomActions.md](../docs/features/SafariCustomActions.md), [PlayerCommands.md](../docs/features/PlayerCommands.md)*
