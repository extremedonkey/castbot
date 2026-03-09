# RaP 0951 — Quick Item / Quick Currency & Drop Feature Retirement

**Date**: 2026-03-09
**Status**: Analysis complete, awaiting decision
**Related**: [SafariCustomActions.md](../03-features/SafariCustomActions.md), [DropsFeature_TechDebt_Options](0966_20251206_DropsFeature_TechDebt_Options.md), [SafariMapDrops.md](../03-features/SafariMapDrops.md)

---

## Original Context

> Lets fully KILL the drop feature as I hate it! I want to create a 'Quick Item' and 'Quick [CurrencyName]' that appears at the Location Actions admin UI as a new second ActionRow alongside Actions. These are streamlined one-modal shortcuts that create a full Custom Action under the hood — same system, fewer clicks. The existing Manage Drops UI stays as-is for now (nobody uses it), but new development goes through Quick Create.

---

## 1. TL;DR

**What we're building**: Two shortcut buttons ("Quick Item" and "Quick Currency") on the Location Actions admin screen that create a fully-formed Custom Action in a single modal + 2 selects, instead of the current 6-8 step process (Create Action → Add Outcome → Configure → Set Limit → Set Style → Done).

**Architecture decision**: Quick Create doesn't introduce a new system — it's a **composition layer** over the existing Action system. Under the hood, it calls the same `createCustomButton()`, `addItemToInventory()`/`updateCurrency()` code paths, produces the same data structures, and triggers the same anchor updates. The resulting action is indistinguishable from one created through the full Action Editor.

**Drop retirement**: Soft deprecation now (hide "Manage Drops" behind the 5th button slot, keep data/handlers). Hard removal later when confirmed zero usage.

---

## 2. Current State: Creating a Give Currency Action Today

```
Admin clicks Location Actions
  → Actions button
    → Create New (select)
      → Modal: Name, Emoji, Description     ← 3 fields
        → Action Editor opens
          → Add Outcome (select)
            → give_currency (select)
              → Amount modal                  ← 1 field
                → Usage Limit (select)        ← 1 select
                  → Button Color (select)     ← 1 select
                    → Done!

Total: 1 modal (3 fields) + 4 selects + multiple button clicks = 8+ interactions
```

**Quick Currency target**: 1 modal (3 fields) + 2 selects = **3 interactions**

---

## 3. Design: Quick Create as a Composition Layer

### 3.1 Key Principle: No New Data, No New Execution

Quick Create actions are **regular Custom Actions**. They:
- Store in `safariContent[guildId].buttons[actionId]` (same as all actions)
- Execute via `executeButtonActions()` (same code path)
- Render on anchor messages via `safariButtonHelper.js` (same rendering)
- Are fully editable in the Action Editor after creation
- Support all conditions, follow-ups, etc. if the admin adds them later

This means zero new execution code, zero new data migration, zero new player-facing behavior.

### 3.2 UI Layout Change

**Current Location Actions (map_location_actions_{coord}):**
```
ActionRow 1: [Location Info] [Media] [Stores] [Manage Drops] [Custom Actions]
ActionRow 2: [Back] [Enter Command] [Navigate]
```

**New Layout:**
```
ActionRow 1: [Location Info] [Media] [Stores]
ActionRow 2: [Actions] [Quick Item] [Quick Currency]
ActionRow 3: [Back] [Enter Command] [Navigate]
```

**Changes:**
- "Custom Actions" moves to Row 2, shortened to "Actions"
- "Manage Drops" removed from Row 1 (moved to Row 2 or hidden — see Design Decision #1)
- Two new buttons added to Row 2

### 3.3 Quick Currency Flow

```
Admin clicks ⚡ Quick [currencyName]
  │
  ├── Modal opens: "Quick Currency Action"
  │   ├── Field 1: Button Name       (text, required, max 80)
  │   ├── Field 2: Amount            (text, required, e.g. "100" or "-50")
  │   └── Field 3: Button Emoji      (text, optional, e.g. "💰")
  │
  ├── Modal submits → Action created with:
  │   ├── name = Button Name
  │   ├── label = Button Name
  │   ├── emoji = Button Emoji (or null)
  │   ├── trigger.type = 'button'
  │   ├── actions[0] = { type: 'give_currency', config: { amount }, executeOn: 'true' }
  │   ├── coordinates = [currentCoordinate]
  │   └── style = 'Primary' (default)
  │
  ├── Post-creation UI shows (updateMessage):
  │   ├── "✅ Created: [emoji] Button Name — gives [amount] [currencyName]"
  │   ├── Usage Limit select  [Once Per Player ▼] (default)
  │   ├── Button Color select [Primary ▼]
  │   └── [Open Action Editor] [Done ▼ Back to Location]
  │
  └── Anchor message auto-updates with new button
```

### 3.4 Quick Item Flow

```
Admin clicks ⚡ Quick Item
  │
  ├── Modal opens: "Quick Item Action"
  │   ├── Field 1: Button Name       (text, required, max 80)
  │   └── Field 2: Button Emoji      (text, optional, e.g. "📦")
  │
  ├── Modal submits → Post-creation UI shows:
  │   ├── Item Select (25 most recent items, label: "Shows 25 most recent — use Action Editor for older items")
  │   │   └── On select → Action created with:
  │   │       ├── actions[0] = { type: 'give_item', config: { itemId, quantity: 1, operation: 'give' }, executeOn: 'true' }
  │   │       └── Same defaults as Quick Currency
  │   ├── Usage Limit select  [Once Per Player ▼]
  │   ├── Button Color select [Primary ▼]
  │   └── [Open Action Editor] [Done ▼ Back to Location]
  │
  └── Anchor message auto-updates with new button
```

**Why 2 steps for Item**: Discord modals can't contain select menus — items must be selected via a message component. The modal captures name + emoji, then the select captures the item. Still only 2 interactions vs 8+.

### 3.5 Post-Creation Confirmation UI

Both Quick Item and Quick Currency show the same post-creation UI:

```
┌──────────────────────────────────────────┐
│ ✅ Quick Action Created                  │
│                                          │
│ [emoji] **Button Name**                  │
│ Gives 100 coins / Gives 1x Sword        │
│ Location: A2                             │
│                                          │
│ ────────────────────────────────────── │
│                                          │
│ Usage Limit                              │
│ [Once Per Player ▼]                      │
│                                          │
│ Button Color                             │
│ [Primary ▼]                              │
│                                          │
│ ────────────────────────────────────── │
│                                          │
│ [Open Action Editor]  [Done]             │
└──────────────────────────────────────────┘
```

- **Usage Limit** select: Unlimited / Once Per Player (default) / Once Globally
- **Button Color** select: Primary / Secondary / Success / Danger
- **Open Action Editor**: Opens the full `createCustomActionEditorUI()` for the new action
- **Done**: Returns to Location Actions

This UI is a **new reusable component** — `buildQuickCreateConfirmUI()` — that can be shared by both Quick Item and Quick Currency (and future Quick types).

---

## 4. Architecture: Module Composition

### 4.1 New Module: `quickActionCreate.js`

```
quickActionCreate.js (~200-250 lines)
├── buildQuickCurrencyModal(coordinate, currencyName)     → Modal data
├── buildQuickItemModal(coordinate)                       → Modal data
├── handleQuickCurrencySubmit(guildId, userId, coordinate, fields)
│   ├── calls createCustomButton()
│   ├── adds give_currency outcome
│   ├── assigns coordinate
│   ├── queues anchor update
│   └── returns confirmation UI
├── handleQuickItemSubmit(guildId, userId, coordinate, fields)
│   ├── calls createCustomButton()
│   ├── stores pending state (name, emoji, coordinate)
│   └── returns item select UI
├── handleQuickItemSelect(guildId, userId, actionId, itemId)
│   ├── adds give_item outcome to pending action
│   ├── queues anchor update
│   └── returns confirmation UI
├── buildQuickCreateConfirmUI(action, coordinate, currencyName, options)
│   └── reusable confirmation/config UI (limit, color, editor, done)
├── handleQuickLimitChange(guildId, actionId, limitType)
│   ├── updates action outcome limit
│   └── returns updated confirmation UI
└── handleQuickColorChange(guildId, actionId, style)
    ├── updates action button style
    ├── queues anchor update
    └── returns updated confirmation UI
```

### 4.2 Reuse Map

| Quick Create needs | Existing function | Module |
|---|---|---|
| Create action shell | `createCustomButton()` | safariManager.js |
| Save action data | `loadSafariContent()` / `saveSafariContent()` | safariManager.js |
| Get items list (25 most recent) | `safariData[guildId].items` | safariManager.js |
| Get currency name | `getCustomTerms()` | safariManager.js |
| Assign to coordinate | Same logic as `entity_create_modal` handler | app.js:41975-42001 |
| Queue anchor update | `afterAddCoordinate()` | anchorMessageIntegration.js |
| Validate emoji | `createSafeEmoji()` | safariButtonHelper.js |
| Action Editor UI | `createCustomActionEditorUI()` | customActionUI.js |
| Change button style | Same logic as `custom_action_button_style` handler | app.js:20946 |
| Change usage limit | Same logic as `safari_currency_limit` / `safari_item_limit` | app.js |

### 4.3 app.js Changes (Router Only)

```javascript
// New button handlers (3 lines each, delegating to quickActionCreate.js)
'quick_currency_{coordinate}'        → show modal (requiresModal: true in registry)
'quick_item_{coordinate}'            → show modal (requiresModal: true in registry)

// New modal handlers
'quick_currency_modal_{coordinate}'  → handleQuickCurrencySubmit()
'quick_item_modal_{coordinate}'      → handleQuickItemSubmit()

// New select/button handlers (post-creation config)
'quick_item_select_{actionId}'       → handleQuickItemSelect()
'quick_limit_{actionId}'             → handleQuickLimitChange()
'quick_color_{actionId}'             → handleQuickColorChange()
'quick_done_{coordinate}'            → return to Location Actions
'quick_edit_{actionId}_{coordinate}' → open Action Editor
```

**Total new app.js lines**: ~60-80 (pure routing, all logic in module)

### 4.4 entityManagementUI.js Changes

Update `getFieldGroups('map_cell')` to remove `items` (Manage Drops) from the top-level field groups. The Location Actions handler in app.js gets the new ActionRow with Quick buttons.

---

## 5. Design Decisions

### Decision 1: What happens to "Manage Drops"?

| Option | Pros | Cons |
|--------|------|------|
| **A: Remove from UI entirely** | Clean, forces migration | Breaks existing drops, admin anger |
| **B: Keep as 6th button (hidden by default)** | No breakage | Extra complexity |
| **C: Move to Action Editor as "Import Drops" tool** | Clean migration path | Scope creep |
| **D: Keep in Row 1, just add Row 2 (recommended)** | Zero breakage, minimal change | Row 1 has 4 buttons instead of 5 |

**Recommendation: D** — Keep "Manage Drops" in Row 1 (renamed to "Drops" to save space), add Quick buttons in new Row 2. When we confirm zero active drops across all guilds, remove it.

**Updated Layout with Option D:**
```
ActionRow 1: [Location Info] [Media] [Stores] [Drops]
ActionRow 2: [Actions] [Quick Item] [Quick Currency]
ActionRow 3: [Back] [Enter Command] [Navigate]
```

### Decision 2: Should Quick Item default to quantity 1 or show a quantity field?

**Recommendation: Default to 1.** The modal already has 2 fields (name + emoji). Adding quantity makes it 3 fields — still fine, but quantity > 1 is rare for location pickups. Admins can edit quantity in the Action Editor if needed. If this becomes a frequent ask, we can add the field later.

### Decision 3: Should the "Quick Currency" button label be dynamic?

Yes — use `getCustomTerms()` to show "Quick [currencyName]" (e.g., "Quick Coins", "Quick Gold"). This requires fetching terms when building the Location Actions UI, which already happens for other features.

### Decision 4: What about the "Action Emoji" label on the existing Create Action modal?

The user wants to add a label clarification: "Emoji that appears on the button". This is a simple text change in the existing modal at app.js:25621. Apply it to both the existing Create Action modal and the Quick modals.

### Decision 5: Should Quick Create actions be distinguishable from regular actions?

**No.** They're regular actions. No special metadata, no special rendering. The only difference is the creation flow. An admin should be able to Quick Create an action and then open it in the Action Editor to add conditions, follow-ups, etc.

However, for debugging/analytics, we could add `metadata.createdVia: 'quick_currency'` or `'quick_item'`. Low effort, useful for understanding feature usage.

---

## 6. Implementation Checklist

| # | Task | File | Effort |
|---|------|------|--------|
| 1 | Create `quickActionCreate.js` module with modal builders and handlers | quickActionCreate.js (new) | 45 min |
| 2 | Add Quick Item/Currency buttons to Location Actions UI | app.js (map_location_actions handler) | 15 min |
| 3 | Add modal show handlers for quick_currency/quick_item | app.js | 10 min |
| 4 | Add modal submit handlers routing to quickActionCreate.js | app.js | 15 min |
| 5 | Add post-creation select/button handlers (limit, color, item select, done) | app.js | 20 min |
| 6 | Update "Action Emoji" label in existing Create Action modal | app.js:25621 | 2 min |
| 7 | Update entityManagementUI.js field groups (restructure rows) | entityManagementUI.js | 10 min |
| 8 | Register all new buttons in BUTTON_REGISTRY | buttonHandlerFactory.js | 10 min |
| 9 | Add dynamicPatterns entries for new wildcard buttons | app.js | 5 min |
| 10 | Write unit tests for quickActionCreate.js | tests/quickActionCreate.test.js | 30 min |
| 11 | Test anchor message updates after Quick Create | Manual testing | 15 min |

**Total estimated effort**: ~3 hours

---

## 7. Drop Feature Retirement Plan

### Phase 1: Soft Deprecation (Now)

- Move "Manage Drops" to 4th position in Row 1 (after Stores), rename to "Drops"
- No removal of any code or data
- Quick Create buttons provide the modern alternative

### Phase 2: Usage Audit (After Quick Create ships)

Run this to find active drops across all guilds:

```bash
# Find all references to drop code
grep -rn "itemDrops\|currencyDrops\|item_drop\|currency_drop" --include="*.js" | grep -v node_modules | grep -v "\.test\." | grep -v docs/

# Key patterns to grep for retirement:
# HANDLERS (app.js):
grep -n "map_add_item_drop\|map_item_drop_select\|map_item_drop_config\|map_item_drop_save\|map_item_drop_remove" app.js
grep -n "map_add_currency_drop\|map_currency_drop_modal\|map_currency_drop_config\|map_currency_drop_style\|map_currency_drop_type\|map_currency_drop_save\|map_currency_drop_remove" app.js
grep -n "map_item_drop_\|map_currency_drop_" app.js  # Player pickup handlers

# UI (entityManagementUI.js):
grep -n "items.*Manage Drops\|itemDrops\|currencyDrops" entityManagementUI.js

# ANCHOR RENDERING (safariButtonHelper.js):
grep -n "itemDrop\|currencyDrop\|drop" safariButtonHelper.js

# PROGRESS REPORTING (safariProgress.js):
grep -n "itemDrop\|currencyDrop\|drop" safariProgress.js

# ANCHOR INTEGRATION:
grep -n "afterUpdateMapDrops\|drop" anchorMessageIntegration.js

# BUTTON REGISTRY:
grep -n "map.*drop" buttonHandlerFactory.js

# DOCUMENTATION:
ls docs/03-features/SafariMapDrops.md
grep -rn "drop" docs/01-RaP/0966*
```

**Data audit** (run on production):
```javascript
// Check all guilds for active drops
const safariData = await loadSafariContent();
for (const [guildId, data] of Object.entries(safariData)) {
  const maps = data.maps || {};
  for (const [mapId, map] of Object.entries(maps)) {
    if (mapId === 'active') continue;
    for (const [coord, cell] of Object.entries(map.coordinates || {})) {
      const itemDrops = cell.itemDrops?.length || 0;
      const currencyDrops = cell.currencyDrops?.length || 0;
      if (itemDrops > 0 || currencyDrops > 0) {
        console.log(`Guild ${guildId}, Map ${mapId}, ${coord}: ${itemDrops} item drops, ${currencyDrops} currency drops`);
      }
    }
  }
}
```

### Phase 3: Hard Removal (After confirming zero usage)

**Files to modify:**
| File | What to remove | Lines (approx) |
|------|----------------|-----------------|
| app.js | All `map_*_drop_*` handlers (admin config + player pickup) | ~800 lines |
| entityManagementUI.js | `items` field group from `map_cell` | ~5 lines |
| safariButtonHelper.js | Drop button rendering in anchor messages | ~30 lines |
| safariProgress.js | Drop display in progress reports | ~40 lines |
| anchorMessageIntegration.js | `afterUpdateMapDrops()` function + export | ~10 lines |
| buttonHandlerFactory.js | All `map_*drop*` BUTTON_REGISTRY entries | ~80 lines |
| docs/03-features/SafariMapDrops.md | Archive or delete | Entire file |

**Data cleanup** (optional): Remove `itemDrops` and `currencyDrops` arrays from coordinate data. Not urgent — empty arrays are harmless.

**Total removal**: ~960 lines of code, 1 doc file

---

## 8. Future Extensibility

The Quick Create pattern is designed to be extended:

| Future Quick Type | What it would create |
|---|---|
| Quick Display Text | Action with `display_text` outcome |
| Quick Teleport | Action with `manage_player_state` (teleport) outcome |
| Quick Attribute | Action with `modify_attribute` outcome |

Each would follow the same pattern:
1. Button on Location Actions → Modal
2. Modal submits → Action created with single outcome
3. Post-creation UI with limit + color + "Open Action Editor"

The `buildQuickCreateConfirmUI()` component is reusable across all of these.

---

## 9. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Quick Create action missing coordinate assignment | Medium | Reuse proven `entity_create_modal` pattern (app.js:41975-42001) |
| Anchor message not updating after Quick Create | Medium | Call `afterAddCoordinate()` — same as existing action creation |
| Item select showing 0 items (no items created yet) | Low | Show "No items found" message with link to Items management |
| Quick Currency modal amount validation | Low | Parse with `parseInt()`, reject NaN, allow negative for remove |
| Component limit (40) on Location Actions page | Low | New layout has 3 rows (~12 components), well under limit |
| Existing Drops breaking when UI changes | None | Drops stay — we're only adding, not removing |

---

## 10. Recommendation

1. **Build Quick Create first** (Phase 1 — this RaP)
2. **Ship and observe** — see if admins use Quick Create instead of Drops
3. **Audit drop usage** (Phase 2) — run data audit in 2-4 weeks
4. **Hard remove drops** (Phase 3) — only after confirmed zero active drops

The Quick Create feature is a 3-hour build that replaces an 8-step process with a 3-step process, using zero new execution code. The Drop retirement is a separate, lower-priority task that can happen on its own timeline.
