# Store Pagination & Unified Store System — As-Built Documentation

**Implemented**: 2026-02-26 (pagination), 2026-02-27 (map store conversion, item limits, UI polish)
**RaP Reference**: [0958_20260226_StorePagination_Analysis.md](/RaP/0958_20260226_StorePagination_Analysis.md)

## Overview

Paginated store browsing for all 3 store types (Global, Posted, Map/Location), using one shared display function. `MAX_ITEMS_PER_STORE` is set to 23 — the practical maximum where the admin string select UI (25 Discord options) still functions with search/action slots.

## The 3 Ways Stores Are Accessed

All stores use the same underlying data (`safariData[guildId].stores[storeId]`) and the same shared display function. The difference is **how the player reaches the store**:

### 1. Global Stores (Player Menu)

**Entry point**: Player `/menu` → Player Menu → store browse button
**Button ID**: `safari_store_browse_{guildId}_{storeId}`
**Context**: Ephemeral — player's private menu
**Handler**: `safari_store_browse_` ButtonHandlerFactory (creates new ephemeral message, NOT updateMessage — because the same button also lives on Posted Store cards)

### 2. Posted Stores (Channel Cards)

**Entry point**: Admin posts store card to a channel via `safari_store_post_channel_`
**Button ID**: `safari_store_browse_{guildId}_{storeId}` (same as Global)
**Context**: Public channel message with Components V2 Container showing store info + Browse button
**Handler**: Same `safari_store_browse_` handler — creates new ephemeral for the clicking player
**Posted via**: `DiscordRequest` REST API (NOT `channel.send()` — Discord.js can't handle raw Components V2 JSON)

The card shows: store emoji + name, item count (📦), and a Browse button.

### 3. Map/Location Stores (Anchor Messages)

**Entry point**: Player clicks store button on a location anchor message in a map channel
**Button ID**: `map_coord_store_{coord}_{storeId}`
**Context**: Public anchor message in location channel
**Handler**: `map_coord_store_` ButtonHandlerFactory — validates channel restriction, then calls shared `createStoreBrowseDisplay()`
**Channel restriction**: Store only accessible from its assigned channel (`coordData.channelId === context.channelId`)
**Data model**: `safariData[guildId].maps[mapId].coordinates[coord].stores` is an **array** of storeIds

**Anchor messages** (built by `safariButtonHelper.js:198-334`) are NOT affected by store display changes — they just contain browse buttons that trigger the handler.

### Shared Across All 3 Types

- **Display function**: `createStoreBrowseDisplay()` in safariManager.js
- **Page navigation**: `safari_store_page_{storeId}_{page}` handler (updateMessage: true)
- **Purchase**: `safari_store_buy_{guildId}_{storeId}_{itemId}` handler (legacy, shared)
- **Back button**: `safari_player_inventory` — consistent across all store types
- **Price source**: `item.basePrice` only (no per-store pricing — `storeItem.price` is ignored)

## Architecture

### Core Function: `createStoreBrowseDisplay()`

**File**: `safariManager.js` (~line 2763)

**Signature**:
```javascript
async function createStoreBrowseDisplay(guildId, storeId, userId, currentPage = 0, options = {})
```

**Returns**: `{ components: [container] }` — no flags (caller handles response type)

**Constants**: `ITEMS_PER_PAGE = 7`

**Options parameter**:
- `options.backButton = undefined` → default inventory button (used by all 3 store types)
- `options.backButton = null` → no back button (available but currently unused)
- `options.backButton = { customId, label, emoji, style }` → custom back button

**Component budget** (39/40 at max capacity with back button):
```
Container(1) + Header(1) + Sep(1)                    =  3
+ 7 × [Section(1) + Text(1) + BtnAccessory(1)]       = 21
+ 6 × Separator between items                         =  6
+ Sep(1) + PaginationRow(1) + 5 NavButtons(5)        =  7
+ BackRow(1) + BackButton(1)                           =  2
                                               TOTAL = 39
```

**Header display**:
```
## 🏪 Store Name `Page 1/4`

**Store Owner Greeting**

> 🪙 Your Balance: 316 Gold
```
- Page info uses backtick format: `` `Page X/Y` `` (only shown when totalPages > 1)
- Store greeting shown (player-facing text)
- Host description NOT shown (host-only, visible in admin UI and store select dropdown)

**Pagination button pattern** (copied from inventory):
- ≤5 pages: Show all `[1] [2] [3*] [4] [5]` — current = Primary+disabled
- \>5 pages: Smart window `[«] [prev] [current*] [next] [»]`
- Button ID: `safari_store_page_{storeId}_{page}`

**Item display**: Each item is a Section (type 9) with:
- TextDisplay child: `generateItemContent(item, customTerms, null, price, itemStock)`
- Button accessory: `safari_store_buy_{guildId}_{storeId}_{itemId}`
- Sold out items: style 2 (grey) + disabled

**Purchase confirmation**: Components V2 Container with green accent (0x27ae60), shows item purchased, price, new balance, quantity owned, and inventory button.

### Handlers in app.js

#### `safari_store_browse_` (Browse)
```javascript
ButtonHandlerFactory.create({
  id: 'safari_store_browse',
  // NO updateMessage — creates new ephemeral message
  handler: async (context) => {
    const result = await createStoreBrowseDisplay(guildId, storeId, userId);
    result.flags = (1 << 15) | InteractionResponseFlags.EPHEMERAL;
    return result;
  }
})
```

#### `safari_store_page_` (Page Navigation)
```javascript
ButtonHandlerFactory.create({
  id: 'safari_store_page',
  updateMessage: true,  // Always within user's own ephemeral store display
  handler: async (context) => {
    // Last segment = page number, rest = storeId (handles underscores in storeIds)
    return await createStoreBrowseDisplay(guildId, storeId, userId, page);
  }
})
```

#### `map_coord_store_` (Map Store Browse)
```javascript
ButtonHandlerFactory.create({
  id: 'map_coord_store',
  handler: async (context) => {
    // Parse: map_coord_store_{coord}_{storeId}
    // Channel restriction check
    // Then: createStoreBrowseDisplay(guildId, storeId, userId, 0)
    result.flags = (1 << 15) | InteractionResponseFlags.EPHEMERAL;
    return result;
  }
})
```

#### `safari_store_buy_` (Purchase)
Legacy handler. Shared by all 3 store types. Components V2 green container confirmation.

### Button Registry

In `buttonHandlerFactory.js`:
- `safari_store_browse_*` — category: `safari_stores`
- `safari_store_page_*` — category: `safari_stores`, parent: `safari_store_browse`
- `map_coord_store_*` — category: `safari_stores`

In `dynamicPatterns` array (app.js): `'safari_store_browse'`, `'safari_store_page'`, `'map_coord_store'`

## Store Item Limit: `MAX_ITEMS_PER_STORE = 23`

### Why 23?

Discord string select menus allow **25 options max**. The store item management UI needs:
- 1-2 slots for action options (Search, Clear Search)
- All stocked items shown as pre-selected defaults

With 23 stocked items: `1 (search) + 23 (stocked) + 1 (available) = 25`. Search works for stores with ≤22 items (1+ result slot). At 23 (the limit), search is disabled.

### Where Enforced

| Location | How |
|---|---|
| `config/safariLimits.js` | `MAX_ITEMS_PER_STORE: 23` constant |
| `entityManagementUI.js` — `createStoreItemSelector()` | Caps available items by `MAX_ITEMS_PER_STORE - currentItemIds.size` |
| `entityManagementUI.js` — search results | Caps with `Math.max(0, Math.min(results, discordSlots, maxAddable))` |
| `app.js` — `store_items_multiselect_` handler | Blocks add if `projectedCount > MAX_ITEMS_PER_STORE` |
| `app.js` — `search_entities` handler | Blocks search modal if store at limit |

### The `slice(0, -1)` Bug (Fixed)

Previously, when `maxSearchResults` calculated to a negative number (e.g., -1), `searchResults.slice(0, -1)` returned all-but-last instead of empty — sending 40+ options to Discord. Fixed with `Math.max(0, ...)` clamp.

### UI Feedback

- Store management header: `📦 **22/23 stocked** (max items per store: 23)`
- Search disabled at limit: ⛔ emoji + "Max item limit of 23 reached, remove items first"
- Search truncation: `⚠️ Only 1 of 8 results showing — store can hold 23 items max.`
- At capacity: `⚠️ Store is at capacity (23/23). Remove items to add new ones.`

## Store Edit Modal

Uses **Label (type 18)** wrappers (Components V2 modal pattern) with raw JSON (not ModalBuilder).

**Field order**:
1. Store Name (Short, required)
2. Store Emoji (Short, optional)
3. Store Owner Greeting — Player-facing (Paragraph, optional) — "Shown at the top of the store when players enter"
4. Store Description — Host-facing (Paragraph, optional) — "Host-only description of store."

**Submission handler**: Uses `getVal()` helper that handles both Label (`component.value`) and legacy ActionRow (`components[0].value`) formats.

### Known Limitation: Custom Emoji in Label-Wrapped Modals

Discord silently clears ALL modal pre-filled values when any text input inside a Label (type 18) wrapper contains custom emoji syntax `<:name:id>` in its `value` field. This does NOT affect ActionRow-wrapped text inputs.

**Workaround**: The emoji field detects custom emoji format and shows it in the `placeholder` instead of `value` ("Current: <:castbot:123> (leave blank to keep)"). The submission handler preserves the existing emoji when the field is blank (`storeEmoji || existingStore.emoji`).

**Implementation**: `createStoreModal(customId, title, existingStore = null)` in `safariManager.js`. Pass `existingStore` to pre-populate (edit), omit for blank fields (create). Returns raw JSON — no `.toJSON()` needed at call sites.

## Store Select Dropdown

In the admin store management UI (`safari_store_manage_items`), the store selector dropdown shows:
- **Label**: Store emoji + name
- **Description**: `{itemCount} items · {hostDescription}` (truncated to 98 chars + `..`)

Built in `storeSelector.js` (`createStoreSelectionUI()`) and legacy path in app.js (search modal handler).

## Files Modified (Full List)

| File | Changes |
|---|---|
| `safariManager.js` | `createStoreBrowseDisplay()` with `options` param, configurable back button, backtick page format, removed host description from player view |
| `app.js` | Browse handler (Factory), page handler (Factory), map store handler (Factory), dynamicPatterns, posted store REST API, store edit modal (Labels), modal submission (getVal helper), item limit enforcement, search limit check, purchase UI (CV2) |
| `entityManagementUI.js` | Item limit display (X/23), search overflow fix, truncation warnings, item format (backtick names, "X in stock"), separator layout |
| `buttonHandlerFactory.js` | `safari_store_browse_*`, `safari_store_page_*` registered |
| `config/safariLimits.js` | `MAX_ITEMS_PER_STORE: 23` |
| `storeSelector.js` | Store description format: "X items · description" |

## What's NOT Changed

- **`createStoreDisplay()`** — old posted store function, still used by Custom Actions `executeStoreDisplay`
- **Anchor messages** (`safariButtonHelper.js`) — just contain browse buttons, unaffected
- **Store assignment to coordinates** — data model unchanged
- **Store creation modal** — unified with edit modal via shared `createStoreModal()` (2026-02-27)
