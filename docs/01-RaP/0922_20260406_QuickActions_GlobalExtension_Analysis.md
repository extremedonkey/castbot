# RaP 0922 — Extending Quick Actions Beyond Map Coordinates

**Date**: 2026-04-06
**Status**: Analysis complete, plan ready
**Related**: [QuickCreateActions.md](../03-features/QuickCreateActions.md) (RaP 0951), [SafariCustomActions.md](../03-features/SafariCustomActions.md)

---

## Original Context

> Are quick actions supported OUTSIDE of safari coordinates?

No. Quick Actions (Quick Text, Quick Currency, Quick Item, Quick Enemy) only appear on the `map_location_actions_{coord}` screen inside an `if (entityType === 'map_cell')` guard in `entityManagementUI.js:483`. But Actions themselves are not coordinate-bound — they can be global, appear in the Player Menu, Crafting Menu, or be linked to items. The Quick Create shortcuts should be available wherever an admin creates Actions.

---

## 1. Where Actions Can Be Created Today

| Entry Point | Has Quick Actions? | Creation Flow |
|---|---|---|
| **Map Coordinate** → Actions → Create New | Yes (4 types) | Quick modal OR full Create modal → Editor |
| **Global Actions** → `/menu` → Production → Advanced → ⚡ Actions → Create New | No | Full Create modal → Editor |
| **Challenge Actions** → Challenge → Add Action | No | Challenge-specific modal |

The Global Actions path (`safari_action_editor` → `entity_custom_action_list_global`) uses the same `createCustomActionSelectionUI()` from `customActionUI.js` but with no coordinate. It already has "Create New Action" in the dropdown — it just lacks the Quick shortcut buttons.

---

## 2. The Gap

When an admin creates an Action from the **global path** (Production Menu → Actions), they must use the full multi-step flow every time. There's no Quick shortcut. This matters because:

- **Player Menu Actions** (menuVisibility: `'player_menu'`) are often global — not tied to any coordinate
- **Crafting recipes** (menuVisibility: `'crafting_menu'`) are global by nature
- **Item-triggered Actions** start global, get items linked later
- Admins who manage many Actions frequently use the global list

---

## 3. Design: Where Quick Actions Should Appear

### 3.1 The Global Actions Screen

**Current UI** (`entity_custom_action_list_global`):
```
Container
├── TextDisplay: "## ⚡ Actions"
├── ActionRow: [String Select: Create New / Search / Clone / existing actions...]
├── TextDisplay: "X actions configured"
└── ActionRow: [← Back]
```

**Proposed UI** — add a Quick Create ActionRow above the select:
```
Container
├── TextDisplay: "## ⚡ Actions"
├── ActionRow: [📃 Quick Text] [🪙 Quick Currency] [📦 Quick Item] [🐙 Quick Enemy]
├── ActionRow: [String Select: Create New / Search / Clone / existing actions...]
├── TextDisplay: "X actions configured"
└── ActionRow: [← Back]
```

The Quick buttons use the same modals and submit handlers — the only difference is they don't auto-assign a coordinate. The coordinate assignment logic already handles `coordinate = null` (the global create handler at `app.js:46730` creates with `coordinates: []`).

### 3.2 Component Budget

Current global Actions screen is lightweight (~5-8 components). Adding one ActionRow with 4 buttons adds 5 components. Well within the 40-component limit.

Map coordinate screen already has the Quick buttons — no changes needed there.

---

## 4. Technical Design

### 4.1 What Changes

**The Quick Action submit handlers already support no-coordinate creation.** Looking at `handleQuickCurrencySubmit` (quickActionCreate.js:274-288):

```javascript
const activeMapId = safariData[guildId]?.maps?.active;
if (activeMapId) {
    const coordData = safariData[guildId].maps[activeMapId].coordinates[coordinate];
    if (coordData) { ... }  // Only assigns if coordinate exists
}
```

If `coordinate` is `null` or `undefined`, the `if (coordData)` check fails gracefully — no coordinate assignment, no anchor update. The Action is created globally. This is already correct for all four handlers.

### 4.2 What Needs to Change

| File | Change | Effort |
|------|--------|--------|
| `customActionUI.js` | Add Quick Action buttons to global Actions screen (`createCustomActionSelectionUI`) | 15 min |
| `app.js` | Add `quick_text_global`, `quick_currency_global`, `quick_item_global`, `quick_enemy_global` button handlers OR make existing handlers coordinate-optional | 10 min |
| `quickActionCreate.js` | Modal `custom_id` needs to encode "global" vs coordinate — e.g., `quick_text_modal_global` | 5 min |

### 4.3 Approach A: Reuse Existing Handlers (Recommended)

The existing handlers already parse coordinate from the custom_id:
```javascript
const coord = custom_id.replace('quick_text_', '');
```

If the button custom_id is `quick_text_global`, then `coord = 'global'`. The submit handler receives `coordinate = 'global'`, and the coordinate assignment logic at `safariData[guildId].maps[activeMapId].coordinates['global']` returns `undefined` → no coordinate assigned. **This already works.**

The only edge case: if a map coordinate is literally named "global" — but coordinates are uppercase letter+number (A1, B3, G6), so this can't happen.

**No submit handler changes needed.** The handlers are already coordinate-agnostic.

### 4.4 Approach B: Explicit Null Coordinate

Pass `null` instead of `'global'` as the coordinate. This requires:
- Custom_id format: `quick_text_modal_` (no suffix) or `quick_text_modal__global` 
- Parsing in submit handler: detect missing coordinate

This is cleaner but requires more changes. Not recommended — Approach A works with zero handler changes.

---

## 5. Implementation Plan

### Phase 1: Add Quick Buttons to Global Actions Screen (30 min)

**File: `customActionUI.js` — `createCustomActionSelectionUI()`**

Add an ActionRow with 4 Quick buttons before the Action select dropdown. The buttons use the same custom_ids as the map coordinate ones, but with `'global'` as the coordinate:

```javascript
// Quick Create buttons (same modals as map coordinates, coordinate='global' = no assignment)
{
    type: 1, // ActionRow
    components: [
        { type: 2, style: 2, label: 'Quick Text', custom_id: 'quick_text_global', emoji: { name: '📃' } },
        { type: 2, style: 2, label: `Quick ${currencyName}`, custom_id: 'quick_currency_global', emoji: currencyEmoji },
        { type: 2, style: 2, label: 'Quick Item', custom_id: 'quick_item_global', emoji: { name: '📦' } },
        { type: 2, style: 2, label: 'Quick Enemy', custom_id: 'quick_enemy_global', emoji: { name: '🐙' } }
    ]
}
```

**Requires:** Import `getCustomTerms` in `customActionUI.js` to get currency name/emoji (or pass via parameter).

### Phase 2: Verify Existing Handlers Work (10 min)

The existing button click handlers (`quick_text_*`, `quick_currency_*`, etc.) already match `'quick_text_global'` because they use `startsWith('quick_text_')`. The modal custom_id becomes `quick_text_modal_global`. The submit handler extracts `coordinate = 'global'`.

**Test:** Click Quick Text from global screen → verify modal opens → submit → verify Action created with `coordinates: []` → verify no anchor update error → verify Action Editor shows.

The Quick Item and Quick Enemy handlers load items/enemies from the guild — no coordinate dependency. They should work unchanged.

### Phase 3: Handle "Return to" After Submit (15 min)

Currently all submit handlers return:
```javascript
return await createCustomActionEditorUI({ guildId, actionId, coordinate });
```

When `coordinate = 'global'`, the editor should work fine — it already handles no-coordinate actions. But the "← Back" button in the editor should navigate back to the global Actions list, not a map coordinate. 

**Check:** Does `createCustomActionEditorUI` handle `coordinate = 'global'` or `coordinate = undefined` correctly for the back button? If not, adjust.

---

## 6. Edge Cases

### Quick Item / Quick Enemy with No Items/Enemies

Already handled — the button click handlers check for empty lists and show an error:
```javascript
if (itemList.length === 0) {
    return res.send({ ... content: '❌ No items exist yet.' });
}
```

### Anchor Updates with coordinate='global'

The anchor update code in submit handlers is wrapped in `try/catch`:
```javascript
try {
    const { afterAddCoordinate } = await import('./anchorMessageIntegration.js');
    await afterAddCoordinate(guildId, actionId, coordinate);
} catch (error) {
    console.error('Error queueing anchor update:', error);
}
```

With `coordinate = 'global'`, `afterAddCoordinate` will try to find coordinate 'global' on the active map, find nothing, and either no-op or throw (caught). Either way, safe.

### Clone Action from Global

Clone already works globally — `clone_action_modal_{sourceId}_global` is an existing pattern (`app.js:46800`). No changes needed.

---

## 7. What This Unlocks

| Use Case | Before | After |
|---|---|---|
| Create a Player Menu action | 8+ interactions (global create → editor → add outcome → configure) | 1 modal (Quick Text/Currency/Item) → set menuVisibility |
| Create a crafting recipe | Same long flow | Quick Item → set menuVisibility to crafting_menu |
| Prototype an action without a map | Full flow only | Quick modal → test → assign coordinates later |
| Bulk create utility actions | Tedious | Quick modal per action, fast iteration |

---

## 8. Summary

| Aspect | Detail |
|---|---|
| **Effort** | ~1 hour total |
| **Risk** | Very low — reuses all existing handlers, no new data paths |
| **Files changed** | 1 (customActionUI.js) — potentially 0 handler changes |
| **Key insight** | Submit handlers are already coordinate-agnostic; passing `'global'` as coordinate skips assignment naturally |
| **Depends on** | Nothing — can be done standalone |
| **Blocked by** | Nothing |

---

*Quick Actions started as a map-coordinate convenience. But Actions aren't map-coordinate-only. The handlers already handle missing coordinates. We just need to show the buttons.* 
