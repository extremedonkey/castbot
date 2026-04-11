# Quick Create Actions

**Status**: Active (Production)
**Module**: `quickActionCreate.js`
**Related**: [SafariCustomActions.md](SafariCustomActions.md), [RaP 0951 (original design)](../01-RaP/0951_QuickCreate_original.md)

---

## Overview

Quick Create Actions are one-modal shortcuts that create fully-formed Actions in a single step. They are a **composition layer** over the existing Action system — under the hood they call `createCustomButton()`, produce standard Action data structures, and the resulting action is fully editable in the Action Editor.

**Normal Action creation**: 8+ interactions (Create → Name → Editor → Add Outcome → Configure → Limit → Color → Done)
**Quick Create**: 1 modal (5 fields) → Action exists with outcome, limit, color, and coordinate assignment all set.

---

## Available Quick Actions

| Type | Button Label | Modal Title | Trigger Type | Outcome Created |
|------|-------------|-------------|--------------|-----------------|
| **Quick Text** | 📃 Quick Text | Quick Text Action | Button Click | `display_text` |
| **Quick Currency** | 🪙 Quick {CurrencyName} | Quick {CurrencyName} Action | Button Click | `give_currency` |
| **Quick Item** | 📦 Quick Item | Quick Item Action | Button Click | `give_item` (qty 1) |
| **Quick Enemy** | 🐙 Quick Enemy | Quick Enemy Action | Button Click | `fight_enemy` |
| **Quick Command** | ❗ Quick Command | ❗ Quick Command | Command (modal) | `display_text` |

Quick Text/Currency/Item/Enemy create **button-triggered** actions (5 fields: name, content/amount/item/enemy, emoji, limit, color).

Quick Command creates a **Command-triggered** action (3-5 fields depending on prefix config: name, prefix select (if prefixes exist), command phrase, display text, usage limit). No button color/emoji since Command actions don't render as buttons on anchor messages.

---

## Where They Appear

### Map Coordinate Screen (Location Actions)

```
[⚡ Actions] [📃 Quick Text] [🪙 Quick Currency] [📦 Quick Item] [🐙 Quick Enemy]
```

Buttons in `entityManagementUI.js` ActionRow, inside `if (entityType === 'map_cell')`. Actions created here are automatically assigned to the coordinate.

### Global Actions Screen

```
## ⚡ Actions
[📃 Quick Text] [🪙 Quick Currency] [📦 Quick Item] [🐙 Quick Enemy]
[Select an action to manage...                                    ▼]
```

Buttons in `customActionUI.js` → `createCustomActionSelectionUI()`, shown only when `coordinate === null` (global view). Actions created here have no coordinates — they're global (usable from Player Menu, commands, item links, etc.).

**Custom IDs**: `quick_text_global`, `quick_currency_global`, `quick_item_global`, `quick_enemy_global`

---

## Technical Design

### Module: `quickActionCreate.js`

**Exports:**
- `buildQuickTextModal(coordinate)` — builds 5-field modal
- `buildQuickCurrencyModal(coordinate, currencyName)` — builds 5-field modal with dynamic currency name
- `buildQuickItemModal(coordinate, items)` — builds 5-field modal with item StringSelect (max 25, newest first)
- `buildQuickEnemyModal(coordinate, enemies)` — builds 5-field modal with enemy StringSelect (max 25, alphabetical)
- `handleQuickTextSubmit(guildId, userId, coordinate, components)` — creates action + display_text outcome
- `handleQuickCurrencySubmit(guildId, userId, coordinate, components)` — creates action + give_currency outcome
- `handleQuickItemSubmit(guildId, userId, coordinate, components)` — creates action + give_item outcome
- `handleQuickEnemySubmit(guildId, userId, coordinate, components)` — creates action + fight_enemy outcome

**Shared constants:**
- `LIMIT_OPTIONS` — built from `buildLimitOptions()`, pre-selects `once_per_player`
- `COLOR_OPTIONS` — Blue (Primary), Grey (Secondary), Green (Success), Red (Danger)
- `STYLE_TO_ACCENT_COLOR` — maps button style to hex accent color for display_text

**Shared utility:**
- `getModalValue(comp)` — extracts value from Label (type 18) component, handles both TextInput (`.value`) and StringSelect (`.values[0]`)

### Handler Flow

1. **Button click** → `app.js` handler imports `buildQuick*Modal()`, returns modal
2. **Modal submit** → `app.js` MODAL_SUBMIT handler imports `handleQuick*Submit()`, delegates
3. **Submit handler**:
   - Extracts 5 field values via `getModalValue()`
   - Validates required fields
   - Validates emoji via `createSafeEmoji()`
   - Creates action shell via `createCustomButton()`
   - Loads safari data, sets name/description/metadata/style
   - Pushes outcome to `action.actions[]`
   - Assigns coordinate (skipped for `coordinate === 'global'`)
   - Saves, queues anchor update (skipped for global)
   - Returns `createCustomActionEditorUI()` with `coordinate: null` for global

### Quick Text Special Behavior

- `title` is set to the Button Name (so display_text shows a heading)
- `color` is mapped from Button Color via `STYLE_TO_ACCENT_COLOR` (Primary→blue, Success→green, etc.)
- `executeOn: 'true'`

### Quick Enemy Special Behavior

- `executeOn: 'always'` (fight happens regardless of conditions)
- Enemy Select shows `❤️{hp} ⚔️{attackValue}` in descriptions

### Quick Command Special Behavior

- Sets `trigger.type: 'modal'` (Command trigger, not Button Click)
- Conditionally shows prefix String Select (only when guild has command prefixes configured)
- Concatenates prefix + phrase on submit (e.g., "climb" + "tree" → "climb tree"), normalized to lowercase
- Creates one `display_text` outcome with `executeOn: 'true'` (pass)
- No button emoji or color (Command actions don't render as buttons on anchor messages)
- `metadata.createdVia: 'quick_command'`
- Component indices shift dynamically based on whether prefix select is present (handled by `hasPrefixes` parameter)

### Global Actions (`coordinate === 'global'`)

When Quick Actions are triggered from the global Actions screen:
- `coordinate` is the string `'global'` (from the button custom_id)
- Coordinate assignment is skipped (`if (coordinate && coordinate !== 'global')`)
- Anchor updates are skipped
- Editor receives `coordinate: null` (not `'global'`)
- Action is created with `coordinates: []` — truly global

### Metadata Tracking

All Quick-created actions have `metadata.createdVia`:
- `'quick_text'`
- `'quick_currency'`
- `'quick_item'`
- `'quick_enemy'`
- `'quick_command'`

---

## Button Registry

```
'quick_text_*'     → category: safari_quick_create, requiresModal: true
'quick_command_*'  → category: safari_quick_create, requiresModal: true
'quick_currency_*' → category: safari_quick_create, requiresModal: true
'quick_item_*'     → category: safari_quick_create, requiresModal: true
'quick_enemy_*'    → category: safari_quick_create, requiresModal: true
```

### CIF Status

| Handler | Pattern | CIF? |
|---------|---------|------|
| Button clicks (show modal) | `quick_text_*`, `quick_currency_*`, `quick_item_*` | Legacy (inline `res.send()`) |
| Button click (enemy) | `quick_enemy_*` | Yes — `ButtonHandlerFactory` with `requiresModal: true` |
| Modal submits | `quick_text_modal_*`, `quick_currency_modal_*`, `quick_item_modal_*`, `quick_enemy_modal_*` | Legacy (MODAL_SUBMIT section — correct) |

---

## Test Coverage

`tests/quickActionCreate.test.js` — 19+ test cases covering modal structure, field types, validation, emoji fallbacks, item limiting.
