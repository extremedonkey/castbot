# Ask CastBot KB — Edit-Mode Plan Reference (castbot-plan v1)

> **Audience**: the Ask CastBot CLI agent running in EDIT MODE, and future maintainers.
> The condensed version of this reference is inlined into every edit prompt
> (askCastBotWrite.js `OPS_REFERENCE`); this file is the full version the agent can
> Read for details. Validation source of truth: `safariPlanSchema.js`.

## Envelope

Emit AT MOST ONE fenced block, at the very END of the reply:

````
```castbot-plan
{ "version": 1, "summary": "one line", "ops": [ ... ] }
```
````

- Max **60 ops**, applied strictly in order.
- The plan never names a guild — the bot binds it to the requesting server.
- A human admin reviews an itemized preview and must click **Apply**; emitting a plan
  changes nothing by itself.

## References between ops

- `create_item` / `create_store` / `create_action` may declare `"ref": "slug"`
  (lowercase `[a-z0-9_-]{1,32}`, unique in the plan).
- Later ops reference the created entity as `"$slug"`. **Refs must be declared before
  use** — order creates first.
- A plain string must match an EXISTING entity: exact ID first, else unique
  case-insensitive name. Ambiguous or missing names are validation errors — nothing is
  auto-created. If the request needs a store/item/action that doesn't exist in
  CURRENT STATE, emit its `create_*` op explicitly.

## Ops — safariContent

| op | required | optional |
|---|---|---|
| `create_item` | `name` (≤80) | `ref`, `emoji`, `description` (≤500), `basePrice` (0–999999, default 10), `maxQuantity` (default -1 = unlimited), `consumable` ("Yes"/"No"), `staminaBoost` (0–10), `attackValue`/`defenseValue` (0–999), `goodOutcomeValue`/`badOutcomeValue` (±999), `category` (≤30), `tags` (≤5 × ≤30) |
| `update_item` | `item`, `set` | any create_item field in `set` |
| `create_store` | `name` (≤100) | `ref`, `emoji`, `description`, `storeownerText` (≤500), `accentColor` (int) |
| `update_store` | `store`, `set` | name/emoji/description/storeownerText/accentColor |
| `stock_item` | `store`, `item` | `price` (0–999999 — **sets the ITEM's price everywhere it's sold**; the game has no per-store prices, so omit it to keep the current price), `stock` (≥-1; -1/omitted = unlimited). Max 23 items per store; duplicates rejected |
| `set_stock` | `store`, `item`, `stock` | item must already be stocked there |
| `update_config` | `set` with ≥1 of: `currencyName` (≤30), `currencyEmoji`, `inventoryName`, `inventoryEmoji`, `craftingName`, `craftingEmoji`, `defaultStartingCurrencyValue` (0–100000), `defaultStartingCoordinate` (must be on the active map) | — |
| `create_action` | `name` (≤80), `trigger`, `outcomes` (1–6) | `ref`, `emoji`, `style` (Primary/Secondary/Success/Danger), `description` (≤200), `conditions`, `coordinates` |
| `update_action` | `action`, `set` | name/emoji/style/description/tags |
| `add_outcome` | `action`, `outcome` | total outcomes per action ≤6 |
| `attach_action` | `action`, `coordinates` | — |
| `update_map_cell` | `coordinate`, `set` (≥1 of `title` ≤100, `description` ≤1000, `emoji`) | **`emoji` + `title` form the location's Discord channel name** — changing either renames that channel automatically after Apply (paced for Discord's 2-renames-per-10-min limit). "Change the channel emoji" is supported through this op |

### Triggers

- `{"type": "button"}` — a clickable button on the location card (default).
- `{"type": "modal", "phrases": ["inspect waterfall", ...]}` — a text Command the
  player types (1–8 phrases; lowercased automatically). Command actions can't be
  posted as buttons.
- `{"type": "button_modal", "phrases": ["secret code"]}` — button opens a text prompt;
  a matching phrase runs the pass outcomes, anything else runs the fail outcomes.
- `{"type": "button_input", "inputLabel?": "≤45", "inputPlaceholder?": "≤100"}` —
  button collects free text, exposed to outcomes as `{triggerInput}`.

### Conditions (optional array, ≤10)

Flat list; `logic` ("AND"/"OR") on a condition connects it to the NEXT one.

- `{"type": "currency", "operator": "gte"|"lte"|"eq_zero", "value": int}`
- `{"type": "item", "operator": "has"|"not_has", "item": "<ref>", "quantity?": int}`
- `{"type": "role", "operator": "has"|"not_has", "roleId": "<discord role id>"}`

### Outcomes (1–6 per action)

Each: `{"type", "config", "executeOn?": "always"|"true"|"false"}` — `"true"` (default)
runs when conditions pass, `"false"` when they fail, `"always"` regardless.

- `display_text`: `{"title?": "≤100", "content": "≤2000"}`
- `give_currency`: `{"amount": ±int, "limit?": LIMIT}`
- `give_item`: `{"item": "<ref>", "quantity?": 1–99, "limit?": LIMIT}`
- `give_role` / `remove_role`: `{"roleId": "<discord role id>"}` (flagged for admin review)
- `follow_up_button`: `{"action": "<ref to another action>"}`

### LIMIT (usage limits)

- `{"once": "per_player"}` — each player can claim once, ever.
- `{"once": "globally"}` — first player to claim gets it; then it's gone.
- `{"once": "per_period", "hours": 12}` — each player once per rolling period
  (`minutes` or `periodMs` also accepted).
- Omit for unlimited.

## Ops — playerData

- `give_currency`: `{"playerId": "id" | ["id", ...] (≤25), "amount": ±int}` — balance
  floors at 0.
- `give_item`: `{"playerId": ..., "item": "<ref>", "quantity?": 1–99}`

## Not supported in v1 (do not emit — explain instead)

Deleting anything, enemies, attribute definitions, scheduled actions, map
creation/resizing, moving players, whole-server bulk grants ("all players"),
attribute/probability/d20 conditions, stamina/attribute outcomes.

## Worked examples

**1. "Create items bulbasaur, squirtle, charmander and add to shop pokestore"** (store
doesn't exist):

```castbot-plan
{ "version": 1, "summary": "Create Pokestore with 3 starter Pokemon", "ops": [
  { "op": "create_store", "ref": "pokestore", "name": "Pokestore", "emoji": "🛒", "storeownerText": "Gotta buy 'em all!" },
  { "op": "create_item", "ref": "bulbasaur", "name": "Bulbasaur", "emoji": "🌱", "description": "A grass-type starter with a bulb on its back.", "basePrice": 100 },
  { "op": "create_item", "ref": "squirtle", "name": "Squirtle", "emoji": "💧", "description": "A water-type starter that hides in its shell.", "basePrice": 100 },
  { "op": "create_item", "ref": "charmander", "name": "Charmander", "emoji": "🔥", "description": "A fire-type starter whose tail flame shows its health.", "basePrice": 100 },
  { "op": "stock_item", "store": "$pokestore", "item": "$bulbasaur", "price": 100 },
  { "op": "stock_item", "store": "$pokestore", "item": "$squirtle", "price": 100 },
  { "op": "stock_item", "store": "$pokestore", "item": "$charmander", "price": 100 }
] }
```

**2. "Get Money button on A1–A8, 5 gold, once every 12 hours"** — ONE action attached
to all eight cells:

```castbot-plan
{ "version": 1, "summary": "Get Money button on A1-A8 (5 gold / 12h)", "ops": [
  { "op": "create_action", "name": "Get Money", "emoji": "🪙", "style": "Success",
    "trigger": { "type": "button" },
    "coordinates": ["A1","A2","A3","A4","A5","A6","A7","A8"],
    "outcomes": [ { "type": "give_currency", "config": { "amount": 5, "limit": { "once": "per_period", "hours": 12 } } } ] }
] }
```

**3. "Rename our currency to Diamonds with :gem: emoji"**:

```castbot-plan
{ "version": 1, "summary": "Currency → Diamonds 💎", "ops": [
  { "op": "update_config", "set": { "currencyName": "Diamonds", "currencyEmoji": "💎" } }
] }
```

**4. "Talk-to-someone flavour on every coordinate"** — one `create_action` per cell
(display_text with invented dialogue), each attached to its own coordinate. Invent
good, distinct characters; keep each under the content cap.
