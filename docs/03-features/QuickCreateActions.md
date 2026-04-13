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

| Type | Button Label | Modal Title | Trigger Type | Outcome(s) Created |
|------|-------------|-------------|--------------|-----------------|
| **Quick Text** | 📃 Quick Text | Quick Text Action | Button Click | `display_text` |
| **Quick Currency** | 🪙 Quick {CurrencyName} | Quick {CurrencyName} Action | Button Click | `give_currency` |
| **Quick Item** | 📦 Quick Item | Quick Item Action | Button Click | `give_item` (qty 1) |
| **Quick Enemy** | 🐙 Quick Enemy | Quick Enemy Action | Button Click | `fight_enemy` |
| **Quick Command** | ❗ Quick Command | ❗ Quick Command | Command (modal) | `display_text` |
| **Quick Crafting** | 🛠️ Quick {CraftingName} | Quick {CraftingName} Action | Button Click | 2× `give_item` (remove) + 1× `give_item` (give) |

Quick Text/Currency/Item/Enemy create **button-triggered** actions (5 fields: name, content/amount/item/enemy, emoji, limit, color).

Quick Command creates a **Command-triggered** action (3-5 fields depending on prefix config: name, prefix select (if prefixes exist), command phrase, display text, usage limit). No button color/emoji since Command actions don't render as buttons on anchor messages.

Quick Crafting creates a **button-triggered recipe Action** (5 fields: name, Crafting Item #1, Crafting Item #2, Item to Give, emoji). It auto-sets Grey color, auto-populates 2 `has item` conditions + 3 outcomes (remove ×2, give ×1), and auto-sets `menuVisibility: 'crafting_menu'` so the recipe appears in the player Crafting menu. See [Crafting.md](Crafting.md) for the crafting surface.

---

## Where They Appear

### Map Coordinate Screen (Location Actions) — 2 rows

```
Row 1:  [📃 Quick Text] [🪙 Quick Currency] [📦 Quick Item] [🐙 Quick Enemy]
Row 2:  [❗ Quick Command] [🛠️ Quick {CraftingName}]
```

Buttons in `entityManagementUI.js` ActionRow, inside `if (entityType === 'map_cell')`. Actions created here are automatically assigned to the coordinate (and the anchor message is updated via `afterAddCoordinate`).

### Global Actions Screen — 2 rows

```
## ⚡ Actions
Row 1:  [📃 Quick Text] [🪙 Quick Currency] [📦 Quick Item] [🐙 Quick Enemy]
Row 2:  [❗ Quick Command] [🛠️ Quick {CraftingName}]
[Select an action to manage...                                    ▼]
```

Buttons in `customActionUI.js` → `createCustomActionSelectionUI()`, shown only when `coordinate === null` (global view). Actions created here have no coordinates — they're global (usable from Player Menu, Crafting menu, commands, item links, etc.).

**Custom IDs**: `quick_text_global`, `quick_currency_global`, `quick_item_global`, `quick_enemy_global`, `quick_command_global`, `quick_crafting_global`

**Row split rationale**: Discord allows max 5 buttons per ActionRow. Adding Quick Crafting pushed the Quick Create set to 6 entries, so the row was split by "trigger type": button-style creators (Text/Currency/Item/Enemy) on Row 1, higher-level creators (Command, Crafting) on Row 2.

---

## Technical Design

### Module: `quickActionCreate.js`

**Exports:**
- `buildQuickTextModal(coordinate)` — builds 5-field modal
- `buildQuickCurrencyModal(coordinate, currencyName)` — builds 5-field modal with dynamic currency name
- `buildQuickItemModal(coordinate, items)` — builds 5-field modal with item StringSelect (max 25, newest first)
- `buildQuickEnemyModal(coordinate, enemies)` — builds 5-field modal with enemy StringSelect (max 25, alphabetical)
- `buildQuickCommandModal(coordinate, prefixes)` — builds 3–5 field modal; prefix select only shown when guild has prefixes
- `buildQuickCraftingModal(coordinate, items, craftingName)` — builds 5-field modal with 3 item StringSelects (max 25, newest first)
- `handleQuickTextSubmit(guildId, userId, coordinate, components)` — creates action + display_text outcome
- `handleQuickCurrencySubmit(guildId, userId, coordinate, components)` — creates action + give_currency outcome
- `handleQuickItemSubmit(guildId, userId, coordinate, components)` — creates action + give_item outcome
- `handleQuickEnemySubmit(guildId, userId, coordinate, components)` — creates action + fight_enemy outcome
- `handleQuickCommandSubmit(guildId, userId, coordinate, components, hasPrefixes)` — creates Command-trigger action + display_text outcome
- `handleQuickCraftingSubmit(guildId, userId, coordinate, components)` — creates action with 2 item conditions + 3 give_item outcomes (remove×2, give×1), Grey, menuVisibility=`crafting_menu`
- `buildCraftingLogic(item1Id, item2Id, itemToGiveId)` — **pure function** returning `{ conditions, outcomes }`; collapses duplicate inputs into a single qty:2 condition + qty:2 remove outcome. Exported for test coverage.

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

### Quick Crafting Special Behavior

Quick Crafting compresses the multi-step work of building a recipe Action (conditions + remove outcomes + give outcome) into a single 5-field modal.

**Modal fields:**
1. `button_name` (Text Input) — label on the crafting button
2. `crafting_item_1` (String Select) — first input, removed on success
3. `crafting_item_2` (String Select) — second input, removed on success
4. `item_to_give` (String Select) — output item (qty 1)
5. `button_emoji` (Text Input, optional) — defaults to the server's `craftingEmoji` if blank/invalid

**Auto-populated on the created Action** (user can edit afterwards in the Action Editor):

| Field | Value |
|---|---|
| `style` / `trigger.button.style` | `'Secondary'` (Grey) |
| `menuVisibility` | `'crafting_menu'` (appears in the Crafting menu) |
| `metadata.createdVia` | `'quick_crafting'` |
| `conditions` | Two `{type:'item', operator:'has', quantity:1, logic:'AND'}` (one per input) |
| `actions` (outcomes) | Three `give_item` outcomes — two with `operation:'remove'` (inputs), one with `operation:'give'` (output). All `executeOn: 'true'` |

**Same-item collapse**: When the player picks the same item for both Crafting Item #1 and #2, `buildCraftingLogic()` collapses to **one condition (qty 2)** + **one remove outcome (qty 2)** + the give outcome. This avoids a data-invalid "2× 1-qty" representation.

**Emoji resolution**: Uses `resolveEmoji()` per [emoji architecture 0928](../01-RaP/0928_20260329_EmojiArchitecture_Analysis.md) — stored as raw string (`'🛠️'` or `'<:name:id>'`). Defaults to the server's `craftingEmoji` (from `safariConfig.craftingEmoji`, fallback `'🛠️'`) when the user leaves the field blank.

**No Fail Outcome**: Quick Crafting does not auto-populate a fail outcome. If a player clicks the button without having both inputs, nothing happens — admins can add a fail outcome in the Action Editor (e.g. "You don't have the required items").

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
- `'quick_crafting'`

---

## Button Registry

```
'quick_text_*'     → category: safari_quick_create, requiresModal: true
'quick_command_*'  → category: safari_quick_create, requiresModal: true
'quick_currency_*' → category: safari_quick_create, requiresModal: true
'quick_item_*'     → category: safari_quick_create, requiresModal: true
'quick_enemy_*'    → category: safari_quick_create, requiresModal: true
'quick_crafting_*' → category: safari_quick_create, requiresModal: true
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
