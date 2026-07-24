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
| **Quick Item** | 📦 Quick Item | Quick Item Action | Button Click | `give_item` (qty 1) |
| **Quick ItemText** | 📦 Quick ItemText | Quick ItemText Action | Button Click | `display_text` + `give_item` (qty 1), display_text always first |
| **Quick Currency** | 🪙 Quick {CurrencyName} | Quick {CurrencyName} Action | Button Click | `give_currency` |
| **Quick Crafting** | 🛠️ Quick {CraftingName} | Quick {CraftingName} Action | Button Click | 2× `give_item` (remove) + 1× `give_item` (give) |
| **Quick Command** | ❗ Quick Command | ❗ Quick Command | Command (modal) | `display_text` |
| **Quick Enemy** | 🐙 Quick Enemy | Quick Enemy Action | Button Click | `fight_enemy` |

Quick Text/Item/ItemText/Currency/Enemy create **button-triggered** actions (5 fields: name, content/item/amount/enemy, emoji, limit, color — ItemText omits color, see below).

Quick ItemText is a **composition of Quick Text + Quick Item** in one modal — it combines their two outcome types into a single Action rather than introducing a new outcome type. It exists because "show some flavor text, then hand over an item" is common enough at map locations to not need two separate quick-created actions bundled together by hand afterwards.

Quick Command creates a **Command-triggered** action (3-5 fields depending on prefix config: name, prefix select (if prefixes exist), command phrase, display text, usage limit). No button color/emoji since Command actions don't render as buttons on anchor messages.

Quick Crafting creates a **button-triggered recipe Action** (5 fields: name, Crafting Item #1, Crafting Item #2, Item to Give, emoji). It auto-sets Grey color, auto-populates 2 `has item` conditions + 3 outcomes (remove ×2, give ×1), and auto-sets `menuVisibility: 'crafting_menu'` so the recipe appears in the player Crafting menu. See [Crafting.md](Crafting.md) for the crafting surface.

---

## Where They Appear

### Map Coordinate Screen (Location Actions) — 2 rows

```
Row 1:  [📃 Quick Text] [📦 Quick Item] [📦 Quick ItemText] [🪙 Quick Currency]
Row 2:  [🛠️ Quick {CraftingName}] [❗ Quick Command] [🐙 Quick Enemy]
```

Buttons in `entityManagementUI.js` `createEditModeUI()`, inside `if (entityType === 'map_cell')`, via `buildActionManagerSection()` (see below). Actions created here are automatically assigned to the coordinate (and the anchor message is updated via `afterAddCoordinate`).

### Global Actions Screen — 2 rows

```
### ```⚡ Actions```
[Select an action to manage...                                    ▼]
Row 1:  [📃 Quick Text] [📦 Quick Item] [📦 Quick ItemText] [🪙 Quick Currency]
Row 2:  [🛠️ Quick {CraftingName}] [❗ Quick Command] [🐙 Quick Enemy]
─────────────────
[← Menu]
```

Reached via the `action_manager` button (renamed from `safari_action_editor` — this screen is an action *selector*, not an editor; the editor is the subsequent `entity_custom_action_list_global` screen). Actions created here have no coordinates — they're global (usable from Player Menu, Crafting menu, commands, item links, etc.).

**As of the Location Manager UI-duplication fix, this screen and the Map Coordinate Screen share one builder** — `buildActionManagerSection({ guildId, coordinate, mapId })` in `customActionUI.js` — so they can no longer drift apart. `coordinate: null` (global) vs. `coordinate: 'A1'` (location) only changes: the header text ("Actions" vs. "Location Actions"), the button custom_id suffix (`_global` vs. `_{coordinate}`), and the select placeholder's location+count suffix (omitted for global — there's no "current location" to summarize). `createCustomActionSelectionUI()` (still the exported entry point, now a thin wrapper) additionally appends a `← Menu` back button + separator, but only when `!coordinate` — the coordinate-scoped variant is always reached from within another screen that already has its own navigation.

**Custom IDs**: `quick_text_global`, `quick_item_global`, `quick_itemtext_global`, `quick_currency_global`, `quick_crafting_global`, `quick_command_global`, `quick_enemy_global` — all seven now exist globally (Quick ItemText's global variant was the specific gap this refactor closed).

**Row split**: Discord allows max 5 buttons per ActionRow; the 7 Quick Create actions split 4/3. Row 1 holds the simpler single-modal, mostly-independent creators (Text, Item, ItemText, Currency); Row 2 holds the three with extra moving parts (Crafting — auto-populates conditions; Command — the one non-button trigger type; Enemy — invokes the combat system). This is a placement choice, not an enforced category — reorder freely as new Quick Create actions are added (edit `buildActionManagerSection()` once, both screens pick it up).

---

## Technical Design

### Module: `quickActionCreate.js`

**Exports:**
- `buildQuickTextModal(coordinate)` — builds 5-field modal
- `buildQuickItemModal(coordinate, items)` — builds 5-field modal with item StringSelect (max 25, most-recently-updated first)
- `buildQuickItemTextModal(coordinate, items)` — builds **5-field** modal (name, text, item, emoji, limit — no color) combining Quick Text + Quick Item's outcomes
- `buildQuickCurrencyModal(coordinate, currencyName)` — builds 5-field modal with dynamic currency name
- `buildQuickEnemyModal(coordinate, enemies)` — builds 5-field modal with enemy StringSelect (max 25, alphabetical)
- `buildQuickCommandModal(coordinate, prefixes)` — builds 3–5 field modal; prefix select only shown when guild has prefixes
- `buildQuickCraftingModal(coordinate, items, craftingName)` — builds 5-field modal with 3 item StringSelects (max 25, most-recently-updated first)
- `handleQuickTextSubmit(guildId, userId, coordinate, components)` — creates action + display\_text outcome
- `handleQuickItemSubmit(guildId, userId, coordinate, components)` — creates action + give\_item outcome
- `handleQuickItemTextSubmit(guildId, userId, coordinate, components)` — creates action + `[display_text (order 0), give_item (order 1)]`; only the give\_item outcome carries the usage limit
- `handleQuickCurrencySubmit(guildId, userId, coordinate, components)` — creates action + give\_currency outcome
- `handleQuickEnemySubmit(guildId, userId, coordinate, components)` — creates action + fight\_enemy outcome
- `handleQuickCommandSubmit(guildId, userId, coordinate, components, hasPrefixes)` — creates Command-trigger action + display\_text outcome
- `handleQuickCraftingSubmit(guildId, userId, coordinate, components)` — creates action with 2 item conditions + 3 give\_item outcomes (remove×2, give×1), Grey, menuVisibility=`crafting_menu`
- `buildCraftingLogic(item1Id, item2Id, itemToGiveId)` — **pure function** returning `{ conditions, outcomes }`; collapses duplicate inputs into a single qty:2 condition + qty:2 remove outcome. Exported for test coverage.
- `getSortedQuickCreateItems(guildId)` — loads guild items sorted **most-recently-updated first** (see [Item Sort](#item-sort-most-recently-updated-not-creation-id-suffix) below), capped at 25. Single source of truth for every item-picker modal — call this instead of loading/sorting items inline.

**Shared field builders** (internal, not exported — module-private): `buildButtonNameField()`, `buildTextToDisplayField()`, `buildItemToGiveField()`, `buildButtonEmojiField()`, `buildUsageLimitField()`, `buildButtonColorField()`, `buildItemOptions()`. Every modal builder composes from these rather than inlining Label/component objects, so wording (labels, descriptions, placeholders) stays consistent by construction as new Quick Create combinations are added — edit the builder once, every modal using that field picks it up. `buildQuickTextModal`, `buildQuickItemModal`, and `buildQuickItemTextModal` are fully composed this way; `buildQuickCurrencyModal`/`buildQuickEnemyModal`/`buildQuickCommandModal`/`buildQuickCraftingModal` still inline their own fields (left untouched when ItemText was added — same words in most cases, but not yet migrated to the shared builders).

**Shared constants:**
- `LIMIT_OPTIONS` — built from `buildLimitOptions()`, pre-selects `once_per_player`
- `COLOR_OPTIONS` — Grey (Secondary) first + default, then Blue (Primary), Green (Success), Red (Danger). Grey-first/default matches the fallback every submit handler uses when the select isn't touched (Discord silently ignores String Select `default` inside modals, so this ordering + the handler fallback are what actually control the effective default, not the `default` flag itself)
- `STYLE_TO_ACCENT_COLOR` — maps button style to hex accent color for display\_text

**Shared utility:**
- `getModalValue(comp)` — extracts value from Label (type 18) component, handles both TextInput (`.value`) and StringSelect (`.values[0]`)

### Item Sort: most-recently-updated, not creation-ID suffix

Every item-picker modal (Quick Item, Quick ItemText, Quick Crafting ×3 selects) now sources its options from `getSortedQuickCreateItems(guildId)`, which sorts by `item.metadata.lastModified` (falling back to `item.metadata.createdAt` for items never edited since creation) — genuinely "last updated first."

Previously, Quick Item and Quick Crafting each inlined their own sort in `app.js`, parsing a numeric suffix out of the item's ID string (`item.id.match(/_(\d+)$/)`) and comparing those numbers descending. That suffix comes from `generateButtonId()` in `safariManager.js`, which keeps only `Date.now().toString().slice(-6)` — the **last 6 digits** of the creation timestamp, which wrap every 1,000,000ms (~16.7 minutes). Two items created further apart than that could sort in the wrong order even under "newest first" semantics, and the sort never reflected edits at all. `getSortedQuickCreateItems()` fixes both problems at once and is now the only item-fetch path Quick Create uses — any new item-picker modal should call it rather than re-deriving a sort.

### Handler Flow

1. **Button click** → `app.js` handler imports `buildQuick*Modal()`, returns modal
2. **Modal submit** → `app.js` MODAL\_SUBMIT handler imports `handleQuick*Submit()`, delegates
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

- `title` is set to the Button Name (so display\_text shows a heading)
- `color` is mapped from Button Color via `STYLE_TO_ACCENT_COLOR` (Primary→blue, Success→green, etc.)
- `executeOn: 'true'`

### Quick ItemText Special Behavior

**Modal fields (5, in order):** Button Name, Text to display, Item to Give, Button Emoji (Optional), Usage Limit. **No Button Color field** — the button always defaults to `style: 'Secondary'` (Grey) (and its `display_text` outcome uses `STYLE_TO_ACCENT_COLOR['Secondary']` accordingly). Kept out to hold the modal at 5 fields (Discord's Label-per-modal cap) once Text-to-display and Item-to-Give are both present.

**Outcome order is fixed**: `[display_text (order 0), give_item (order 1, qty 1, operation: 'give')]`. `display_text` is always pushed first regardless of field order in the modal, because it renders first once the two outcome responses are bundled into one message — text-then-reward reads better than reward-then-text.

**Usage limit applies only to the `give_item` outcome** — `display_text` is never claim-gated (same precedent as Quick Item; Quick Text's own Usage Limit field is likewise not applied to its `display_text` outcome, since display-only outcomes aren't "rewarding" in the claim-tracking sense — see [SafariUsageLimits.md](SafariUsageLimits.md)).

- `metadata.createdVia: 'quick_itemtext'`
- Button click handler uses `ButtonHandlerFactory` (CIF) with `requiresModal: true` — unlike Quick Text/Currency/Item's legacy inline handlers, this one follows current CLAUDE.md guidance for new buttons from the start
- Item select sourced via `getSortedQuickCreateItems()` (see above)

### Quick Enemy Special Behavior

- `executeOn: 'always'` (fight happens regardless of conditions)
- Enemy Select shows `❤️{hp} ⚔️{attackValue}` in descriptions

### Quick Command Special Behavior

- Sets `trigger.type: 'modal'` (Command trigger, not Button Click)
- Conditionally shows prefix String Select (only when guild has command prefixes configured)
- Concatenates prefix + phrase on submit (e.g., "climb" + "tree" → "climb tree"), normalized to lowercase
- Creates one `display_text` outcome with `executeOn: 'true'` (pass)
- No button emoji or color (Command actions don't render as buttons on anchor messages) — the action shell's internal `style` still defaults to `'Secondary'` (Grey, matching every other no-selector Quick Create default), and its `display_text` outcome uses `STYLE_TO_ACCENT_COLOR['Secondary']` accordingly
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

Applies to every Quick Create action, including Quick ItemText — all seven have a `_global` variant.

When Quick Actions are triggered from the global Actions screen:
- `coordinate` is the string `'global'` (from the button custom\_id)
- Coordinate assignment is skipped (`if (coordinate && coordinate !== 'global')`)
- Anchor updates are skipped
- Editor receives `coordinate: null` (not `'global'`)
- Action is created with `coordinates: []` — truly global

### Metadata Tracking

All Quick-created actions have `metadata.createdVia`:
- `'quick_text'`
- `'quick_item'`
- `'quick_itemtext'`
- `'quick_currency'`
- `'quick_enemy'`
- `'quick_command'`
- `'quick_crafting'`

---

## Button Registry

```
'quick_text_*'     → category: safari_quick_create, requiresModal: true
'quick_item_*'     → category: safari_quick_create, requiresModal: true
'quick_itemtext_*' → category: safari_quick_create, requiresModal: true
'quick_command_*'  → category: safari_quick_create, requiresModal: true
'quick_currency_*' → category: safari_quick_create, requiresModal: true
'quick_enemy_*'    → category: safari_quick_create, requiresModal: true
'quick_crafting_*' → category: safari_quick_create, requiresModal: true
```

### CIF Status

| Handler | Pattern | CIF? |
|---------|---------|------|
| Button clicks (show modal) | `quick_text_*`, `quick_currency_*`, `quick_item_*` | Legacy (inline `res.send()`) |
| Button click (enemy/command/crafting/itemtext) | `quick_enemy_*`, `quick_command_*`, `quick_crafting_*`, `quick_itemtext_*` | Yes — `ButtonHandlerFactory` with `requiresModal: true` |
| Modal submits | `quick_text_modal_*`, `quick_currency_modal_*`, `quick_item_modal_*`, `quick_itemtext_modal_*`, `quick_enemy_modal_*`, `quick_command_modal_*`, `quick_crafting_modal_*` | Legacy (MODAL\_SUBMIT section — correct, per CLAUDE.md modal-submit exception) |

---

## Test Coverage

`tests/quickActionCreate.test.js` — 30+ test cases covering modal structure, field types, validation, emoji fallbacks, item limiting, item sort-order (last-updated vs. the old truncated-ID-suffix bug), and Quick ItemText's fixed display_text-first outcome ordering.
