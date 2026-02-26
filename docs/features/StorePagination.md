# Store Pagination — As-Built Documentation

**Implemented**: 2026-02-26
**RaP Reference**: [0958_20260226_StorePagination_Analysis.md](/RaP/0958_20260226_StorePagination_Analysis.md)

## Overview

Paginated store browsing for Global Stores and Posted Stores, replacing the previous 8-item hard limit. Uses the same smart pagination pattern as Safari Inventory. The `MAX_ITEMS_PER_STORE` config limit (25) was removed — stores are now bounded only by `MAX_ITEMS_PER_GUILD` (200).

## Architecture

### Core Function: `createStoreBrowseDisplay()`

**File**: `safariManager.js` (after `createStoreDisplay()`, ~line 2753)

**Signature**:
```javascript
async function createStoreBrowseDisplay(guildId, storeId, userId, currentPage = 0)
```

**Returns**: `{ components: [container] }` — no flags (caller handles response type)

**Constants**: `ITEMS_PER_PAGE = 7`

**Component budget** (39/40 at max capacity):
```
Container(1) + Header(1) + Sep(1)                    =  3
+ 7 × [Section(1) + Text(1) + BtnAccessory(1)]       = 21
+ 6 × Separator between items                         =  6
+ Sep(1) + PaginationRow(1) + 5 NavButtons(5)        =  7
+ BackRow(1) + BackButton(1)                           =  2
                                               TOTAL = 39
```

**Pagination button pattern** (copied from inventory, `safariManager.js:4018-4100`):
- ≤5 pages: Show all `[1] [2] [3*] [4] [5]` — current = Primary+disabled
- \>5 pages: Smart window `[«] [prev] [current*] [next] [»]`
- Button ID: `safari_store_page_{storeId}_{page}`
- Max 5 buttons per ActionRow

**Item display**: Each item is a Section (type 9) with:
- TextDisplay child: `generateItemContent(item, customTerms, null, price, itemStock)`
- Button accessory: `safari_store_buy_{guildId}_{storeId}_{itemId}`
- Sold out items: style 2 (grey) + disabled

**Back button**: `safari_player_inventory` (returns to inventory view)

### Handlers in app.js

#### `safari_store_browse_` (Browse)
```javascript
ButtonHandlerFactory.create({
  id: 'safari_store_browse',
  // NO updateMessage — creates new ephemeral message
  // Because this button lives on BOTH player menu (ephemeral) AND posted channel messages (public)
  handler: async (context) => {
    const result = await createStoreBrowseDisplay(guildId, storeId, userId);
    result.flags = (1 << 15) | InteractionResponseFlags.EPHEMERAL;
    return result;
  }
})
```

**Why not `updateMessage: true`?** The browse button exists on:
1. Player `/menu` (ephemeral) — updateMessage would work here
2. Posted channel messages (public) — updateMessage fails because the public message lacks IS_COMPONENTS_V2 flag

Using ephemeral (new message) works for both contexts.

#### `safari_store_page_` (Page Navigation)
```javascript
ButtonHandlerFactory.create({
  id: 'safari_store_page',
  updateMessage: true,  // Always within user's own ephemeral store display
  handler: async (context) => {
    // Parse: safari_store_page_{storeId}_{page}
    // Last segment = page number, rest = storeId (handles underscores)
    return await createStoreBrowseDisplay(guildId, storeId, userId, page);
  }
})
```

#### `safari_store_buy_` (Purchase — unchanged)
Legacy handler at app.js. Shared by Global Stores, Posted Stores, and Map Stores. Format: `safari_store_buy_{guildId}_{storeId}_{itemId}`.

### Posted Store Channel Card

When an admin posts a store to a channel via `safari_store_post_channel_`, the message is sent via `DiscordRequest` REST API (NOT `channel.send()` — Discord.js can't handle raw Components V2 JSON):

```javascript
await DiscordRequest(`channels/${channelId}/messages`, {
  method: 'POST',
  body: {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [storeCard]  // Container with store info + browse button
  }
});
```

The card shows: store emoji + name, description/owner text, item count, and a Browse button.

### Button Registry

In `buttonHandlerFactory.js`:
- `safari_store_browse_*` — category: `safari_stores`
- `safari_store_page_*` — category: `safari_stores`, parent: `safari_store_browse`

In `dynamicPatterns` array (app.js): `'safari_store_browse'`, `'safari_store_page'`

### Config Changes

- `config/safariLimits.js`: `MAX_ITEMS_PER_STORE` **removed**
- `editFramework.js`: `maxItems` removed from store content config
- Stores are now bounded by `MAX_ITEMS_PER_GUILD` (200) only

## Files Modified

| File | Changes |
|---|---|
| `safariManager.js` | `createStoreBrowseDisplay()` function, `parseTextEmoji` import, export added |
| `app.js` | Browse handler (Factory), page handler (Factory), dynamicPatterns, posted store REST API fix |
| `buttonHandlerFactory.js` | `safari_store_browse_*`, `safari_store_page_*` registered |
| `config/safariLimits.js` | `MAX_ITEMS_PER_STORE` removed |
| `editFramework.js` | `maxItems` removed from store content |

## What's NOT Changed

- **Buy handler** (`safari_store_buy_*`) — legacy, shared across all store types
- **Map Stores** (`map_coord_store_*`) — separate handler, see conversion guide below
- **`createStoreDisplay()`** — old posted store function, still used by Custom Actions `executeStoreDisplay`
- **Anchor messages** — unaffected (just contain browse buttons)

---

## Pending: Map Store Conversion Guide

### Context

Map/Location Stores (`map_coord_store_{coord}_{storeId}`) have their own inline display handler at `app.js:27552-27695`. It builds a text-block-and-buttons layout (~140 lines) instead of using the shared `createStoreBrowseDisplay()`. Converting it would unify the store display and add pagination to location stores.

### Current Map Store Architecture

**Handler**: `app.js:27552-27695` — ButtonHandlerFactory with `ephemeral: true`

**Current layout** (text block + button rows):
```
Container (17)
├── TextDisplay — header (store name, emoji, description, balance)
├── Separator
├── TextDisplay — ALL items as text block (~100-200 chars per item)
├── Separator
├── ActionRow — up to 5 buy buttons
└── ActionRow — up to 5 more buy buttons (max 10 items)
```

**Channel restriction**: Checks `coordData.channelId !== context.channelId` before showing store.

**Purchase**: Uses `safari_store_buy_{guildId}_{storeId}_{itemId}` — same as Global/Posted stores.

**Data model**: `safariData[guildId].maps[mapId].coordinates[coord].stores` is an **array** of storeIds. Multiple stores per coordinate, same store on multiple coordinates.

### Anchor Messages (NOT affected by conversion)

Anchor messages are public channel messages built by `safariButtonHelper.js:198-334`. They contain:
- Location info (title, description, images)
- Store buttons: `map_coord_store_{coord}_{storeId}` (one per assigned store)
- Item/currency drop buttons
- Safari custom action buttons

**The anchor just has browse buttons** — clicking one creates a separate ephemeral store display. Converting the store display does NOT require any anchor message changes.

### Conversion Steps

#### Step 1: Add optional back button parameter to `createStoreBrowseDisplay()`

Currently the function hardcodes the back button to `safari_player_inventory`. Add an optional `options` parameter:

```javascript
// Change signature from:
async function createStoreBrowseDisplay(guildId, storeId, userId, currentPage = 0)

// To:
async function createStoreBrowseDisplay(guildId, storeId, userId, currentPage = 0, options = {})

// Where options can include:
// options.backButton = { customId: 'xyz', label: 'Back', emoji: '🔙' }
// options.backButton = null  → no back button at all
// options.backButton = undefined → default (safari_player_inventory)
```

At the back button creation section (near end of function), replace the hardcoded button with:

```javascript
// Back button (configurable)
if (options.backButton !== null) {
    const backConfig = options.backButton || {
        customId: 'safari_player_inventory',
        label: customTerms.inventoryName,
        emoji: customTerms.inventoryEmoji || '🧰',
        style: ButtonStyle.Primary
    };
    const backButton = new ButtonBuilder()
        .setCustomId(backConfig.customId)
        .setLabel(backConfig.label)
        .setStyle(backConfig.style || ButtonStyle.Secondary);
    if (backConfig.emoji) backButton.setEmoji(backConfig.emoji);
    containerComponents.push(new ActionRowBuilder().addComponents(backButton).toJSON());
}
```

Component budget note: Without back button, saves 2 components (ActionRow + Button) = 37/40, allowing potential increase to 8 items per page if desired for map stores.

#### Step 2: Replace map store handler (app.js:27552-27695)

Replace the ~140 lines of inline UI with:

```javascript
} else if (custom_id.startsWith('map_coord_store_')) {
  return ButtonHandlerFactory.create({
    id: 'map_coord_store',
    handler: async (context) => {
      // Parse: map_coord_store_{coord}_{storeId}
      const parts = context.customId.replace('map_coord_store_', '').split('_');
      const coord = parts[0];
      const storeId = parts.slice(1).join('_');

      // Channel restriction check (keep existing behavior)
      const { loadSafariContent } = await import('./safariManager.js');
      const safariData = await loadSafariContent();
      const activeMapId = safariData[context.guildId]?.maps?.active;
      const coordData = safariData[context.guildId]?.maps?.[activeMapId]?.coordinates?.[coord];

      if (!coordData || coordData.channelId !== context.channelId) {
        return {
          flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL,
          components: [{
            type: 17,
            components: [{ type: 10, content: '> You can only access this store from its location!' }]
          }]
        };
      }

      // Use shared paginated store display (no back button for location stores)
      const { createStoreBrowseDisplay } = await import('./safariManager.js');
      const result = await createStoreBrowseDisplay(
        context.guildId, storeId, context.userId, 0,
        { backButton: null }
      );
      result.flags = (1 << 15) | InteractionResponseFlags.EPHEMERAL;
      return result;
    }
  })(req, res, client);
}
```

#### Step 3: Page navigation (already works)

The `safari_store_page_` handler already exists and handles pagination. Map store page navigation will automatically use it because `createStoreBrowseDisplay()` generates `safari_store_page_{storeId}_{page}` buttons.

However, `safari_store_page_` currently uses `updateMessage: true` which is correct — it updates the ephemeral store display in-place.

#### Step 4: Test

1. Navigate to a location channel with a store on the anchor
2. Click the store button on the anchor message
3. Should see paginated store as new ephemeral message (no back button)
4. Page navigation updates in-place
5. Buy button works (same `safari_store_buy_` handler)
6. Channel restriction still enforced (can't access from wrong channel)
7. Multiple stores on same coordinate each work independently

### What NOT to change

- **Anchor messages** — no changes needed, store buttons stay as `map_coord_store_{coord}_{storeId}`
- **Store assignment to coordinates** — data model unchanged
- **Purchase handler** — already shared
- **`safariButtonHelper.js`** — anchor component building unchanged

### Estimated Effort

~30 minutes total:
- Step 1 (back button parameter): ~10 min
- Step 2 (handler replacement): ~10 min
- Step 3-4 (testing): ~10 min
