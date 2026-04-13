# Crafting

**Status**: Active (Production)
**Modules**: `safariManager.js` (menu UI), `playerCardMenu.js` (player card select), `customActionUI.js` (admin select), `safariConfigUI.js` (settings), `quickActionCreate.js` (Quick Crafting)
**Related**: [SafariCustomActions.md](SafariCustomActions.md), [PlayerMenuActions.md](PlayerMenuActions.md), [QuickCreateActions.md](QuickCreateActions.md), [SuperPlayerMenu](../01-RaP/0924_20260405_SuperPlayerMenu_Analysis.md)
**Original design**: Promoted from `0961_20260111_CraftingMenuActions_Analysis.md` (RaP)

---

## Overview

Crafting is a dedicated **menu surface** for a subset of Actions. Admins flag any Action as "show in Crafting menu" via a single-select on the Coordinate Management screen, and those Actions appear together in a player-facing Crafting menu — separate from the regular Player Menu actions.

The whole feature is a thin layer over the existing Action system: no new outcome types, no new trigger types. It's purely a **visibility/grouping** mechanism, plus a server-customizable name and emoji so the menu can be re-themed (e.g. "🌱 Gardening", "🍳 Cooking", "🔮 Alchemy").

---

## Customization (per server)

Configured under Settings → CastBot-Wide → Crafting:

| Field | Default | Purpose |
|---|---|---|
| `craftingName` | `Crafting` | Displayed everywhere the feature surfaces (button label, menu header, "X recipes" text) |
| `craftingEmoji` | `🛠️` | Displayed alongside name; also used as the default emoji for crafting selects when the Action has no emoji of its own |

Both stored on `safariConfig` (per-guild) and read via `getCustomTerms(guildId)`.

Defaults are applied lazily in `safariConfigUI.js:220-221` — empty/missing values resolve at read time, never persisted.

---

## Menu Visibility (Action field)

Each Action has a `menuVisibility` field (enum):

| Value | Effect |
|---|---|
| `'none'` | Action only fires from its map coordinate(s). Not in any player menu. |
| `'player_menu'` | Action appears in the Player Menu actions list. |
| `'crafting_menu'` | Action appears in the Crafting menu / select. |

**Mutually exclusive** — an Action is in exactly one menu surface (or none). Set via the String Select in Coordinate Management UI (`customActionUI.js:1964-2020`).

### Backward compatibility

Legacy `showInInventory: true` Actions are auto-migrated on read:

```js
const visibility = action.menuVisibility || (action.showInInventory ? 'player_menu' : 'none');
```

This pattern is duplicated in 4 places (`customActionUI.js:176, 200`, `playerCardMenu.js:528`, etc.) — no one-shot migration was run; resolution happens lazily everywhere `menuVisibility` is read.

---

## Where Crafting Surfaces

### 1. Player Inventory → 🛠️ Crafting button

The Player Inventory screen shows a Crafting button when the guild has at least one `menuVisibility: 'crafting_menu'` Action. Clicking opens the **Crafting Menu UI** — a dedicated screen with action buttons.

- Custom ID: `safari_crafting_menu_{guildId}`
- Handler: `app.js:31326` (`safari_crafting_menu_*`)
- Button registered: `buttonHandlerFactory.js:3386`

### 2. Player Card → Crafting String Select

The player card menu (`playerCardMenu.js:495-522`) renders a String Select labeled `"Select a {craftingName} recipe..."` populated with up to 23 crafting Actions. Selecting a recipe fires that Action.

This is the "select" surface — same Action pool, different presentation (select vs. buttons).

### 3. Admin: Coordinate Management

`customActionUI.js:1964-2020` renders the Menu Visibility String Select with three options (Hidden / Player Menu / Crafting). Selection routes to `menu_visibility_select_*` handler at `app.js:31257`, which writes `action.menuVisibility` and logs the new per-guild crafting count.

### 4. Admin: Quick Crafting (creation shortcut)

A one-modal shortcut that creates a fully-formed crafting recipe Action. Button appears as `🛠️ Quick {craftingName}` (e.g. `🛠️ Quick Crafting`, `🌱 Quick Gardening`) on both the map-cell Location Actions screen and the global Actions screen (Row 2).

Produces an Action with:
- `style: 'Secondary'` (Grey)
- `menuVisibility: 'crafting_menu'` — auto-appears in the Crafting menu without any extra admin steps
- 2 `item`-type conditions (one per input, `operator:'has'`, `quantity:1`, `logic:'AND'`)
- 3 Pass Outcomes: `give_item` with `operation:'remove'` × 2 (inputs) + `give_item` with `operation:'give'` × 1 (output)
- `metadata.createdVia: 'quick_crafting'`

When the player picks the same item for both inputs, the logic collapses to 1 condition (qty 2) + 1 remove outcome (qty 2). Full details in [QuickCreateActions.md § Quick Crafting Special Behavior](QuickCreateActions.md).

---

## Crafting Menu UI (`createCraftingMenuUI`)

**Location**: `safariManager.js:4835`

**Render logic**:
1. Load all guild Actions, filter to `menuVisibility === 'crafting_menu'` AND `trigger.type ∈ {button, button_modal, button_input}`
2. Header: `## {craftingEmoji} {craftingName}` (e.g. `## 🛠️ Crafting`)
3. Section subheader: `> **\`⚒️ Recipes\`**`
4. Sort by `inventoryConfig.sortOrder` (default 999) then alphabetically by name
5. Render up to **15 actions** in 3 ActionRows of 5 buttons (Discord limit)
6. If >15 configured, append `*+N more recipes (limit reached)*`
7. Empty state: `*No {craftingName} recipes available.*`

**Per-button styling fallback chain** (most specific wins):
- Label: `inventoryConfig.buttonLabel` → `trigger.button.label` → `action.name` → `'Craft'`
- Style: `inventoryConfig.buttonStyle` → `trigger.button.style` → `action.style` → `Secondary`
- Emoji: `inventoryConfig.buttonEmoji` → `trigger.button.emoji` → `action.emoji`

**Modal-trigger Actions** (`button_modal`, `button_input`) get a `modal_launcher_*` custom_id so click pops a modal; plain `button` Actions get a direct `safari_*` custom_id.

---

## Component Budget

Crafting Menu fits comfortably within the 40-component limit:

| Component | Count |
|---|---|
| Container (17) | 1 |
| Header + Separator + Section header (10/14/10) | 3 |
| ActionRows (1) | 1–3 |
| Buttons (2) | 1–15 |
| **Total** | **~6–22** |

The 15-action cap is a deliberate safety margin — 15 buttons + header components + back-button row stays well under 40 even with future additions.

---

## Admin Warning

When an admin sets a 10th+ Action to `crafting_menu`, the Coordinate Management UI surfaces a warning that uses the customized `craftingName`:

> ⚠️ {N} actions in {craftingName} menu. Some may not display due to Discord limits.

The 10-threshold gives a 5-action buffer before the 15-cap kicks in.

---

## Data Structure (per server)

Crafting adds **no new top-level data structures**. It piggybacks on existing fields:

```js
// safariContent.json
{
  "{guildId}": {
    "buttons": {
      "{actionId}": {
        // ... existing Action fields ...
        "menuVisibility": "crafting_menu",   // NEW field (enum)
        "inventoryConfig": {                  // optional, used for ordering/styling in menu
          "sortOrder": 1,
          "buttonLabel": "Craft Sword",
          "buttonStyle": "Primary",
          "buttonEmoji": "🗡️"
        }
      }
    }
  }
}

// safariConfig.json (or wherever customTerms live)
{
  "{guildId}": {
    "craftingName": "Gardening",   // optional; default 'Crafting'
    "craftingEmoji": "🌱"           // optional; default '🛠️'
  }
}
```

The `buttons` key is the legacy storage key for Actions (see [Action Terminology](../01-RaP/0956_20260308_ActionTerminology_Analysis.md)).

---

## Button / Handler Registry

```
'safari_crafting_menu_*'      → category: safari_player, style: Primary, 🛠️ — opens Crafting Menu from Inventory
'menu_visibility_select_*'    → category: safari_management, 📋        — admin select on Coord Management
'crafting_back_inventory_*'   → category: safari_player, style: Secondary — return to Inventory from Crafting Menu
```

All handlers use **ButtonHandlerFactory** (CIF). Confirmed via `app.js:31257` and `app.js:31326`.

---

## Recent Notable Changes

- **`35f3cf4b`** — Fix crafting select interaction-failed: invalid emoji fallback in `resolveEmoji` call when Action used a custom Discord emoji string and no emoji-object fallback was supplied. Affects `playerCardMenu.js:516-519`.
- **`c5269324`** — 10+ actions warning message now uses customized `craftingName` instead of hardcoded "Crafting".
- **`3c9da82c`** — Settings UI restructure: introduced customizable `craftingName`/`craftingEmoji` under CastBot-Wide section.

---

## Edge Cases

| Case | Behavior |
|---|---|
| No crafting Actions configured | Crafting button hidden from Inventory; player card select shows "No {name} recipes configured" |
| >15 crafting Actions | Top 15 (by sortOrder) shown in menu; admin warning at 10+ |
| Action has location-required conditions | Will fail at execution time (same caveat as Player Menu Actions) |
| Crafting name with custom emoji string | Parsed via regex `<:name:id>` / `<a:name:id>`, falls through to Unicode if invalid |
| Legacy `showInInventory: true` Actions | Resolved lazily to `'player_menu'` on every read; never written back |

---

## Future Considerations

- **More menu types** — `menuVisibility` enum is intentionally extensible. Adding `'shop_menu'` or `'battle_menu'` would only require new option in the select + new render function, no schema migration.
- **Recipe ingredients** — currently any Action can be a "recipe"; the outcome (`give_item`, `remove_item`, etc.) defines what crafting actually does. A formal recipe abstraction (input items → output items) doesn't exist yet.
- **One-shot migration of `showInInventory`** — currently resolved lazily in 4+ places. A single migration pass would let all callers read `menuVisibility` directly.
