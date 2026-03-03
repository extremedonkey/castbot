# Item-Triggered Custom Actions

**RaP:** [0954_20260303_ItemTriggeredActions_Analysis.md](../01-RaP/0954_20260303_ItemTriggeredActions_Analysis.md)
**Status:** Implemented (2026-03-04)

---

## Overview

Players can trigger custom actions by using items from their inventory. Admins link actions to items via the Action Visibility screen; players see `⚡ Use` or `📦 Use Item` in their inventory.

## Data Model

```
safariContent[guildId].buttons[actionId].linkedItems = ["itemId1", "itemId2"]
```

Single source of truth on the **action side**. Reverse lookup via `getLinkedActions(guildId, itemId, safariData)` scans all actions for `linkedItems.includes(itemId)` where `trigger.type === 'button'`.

## Inventory Display Decision Matrix

| Item properties | Linked actions | Total uses | Component | Custom ID |
|---|---|---|---|---|
| No attack, no stamina | 0 | 0 | No button | — |
| Attack only | 0 | 1 | Grey button | `safari_attack_player_{itemId}` |
| Stamina only | 0 | 1 | Grey button | `safari_use_item_{itemId}` |
| No attack, no stamina | 1 | 1 | Grey ⚡ button | `safari_use_linked_{itemId}` |
| Any combo | — | 2+ | String Select 📦 | `safari_item_uses_{itemId}` |

String Select option order: Attack → Stamina → Custom Actions (alpha sorted). Hard cap 20.

## Consumption Logic

Consumption is tied to **sub-action usage limits**, not just the consumable flag:

- `shouldConsumeItem(item, action)` — true only if `consumable === 'Yes'` AND action has sub-actions with `limit.type` of `once_per_player` or `once_globally`
- `hasUnclaimedSubActions(action, userId)` — pre-execution guard prevents wasting items when all limits claimed
- `consumeItemAfterAction()` — decrements quantity post-execution
- All unlimited sub-actions = never consumed (by design)

## Execution Flow

Both `safari_use_linked_` and `safari_item_uses_` use manual response handling (not ButtonHandlerFactory) with `DEFERRED_UPDATE_MESSAGE`:

1. Defer original inventory message (type 6)
2. Execute action via `executeButtonActions()`
3. Post bundled action result as ephemeral **follow-up** (`createFollowupMessage`)
4. Patch original message with refreshed inventory (`updateDeferredResponse` + `createPlayerInventoryDisplay`)

## Admin UI — Action Visibility (LEAN)

`createCoordinateManagementUI()` in `customActionUI.js`. Accent: `0x5865F2` (blurple).

Sections: `📋 Menu` → `🗺️ Map Locations (N)` → `📦 Items Using Action (M)`. Bottom nav: `← Back`, `📍 Add Coord`, `#️⃣ Post`, `📦 Item Action` (4th button, hidden when `trigger.type !== 'button'`).

Component budget mitigation: collapses to summary text when coords + items > 8.

## Item Link Sub-UI

`createItemLinkUI()` in `customActionUI.js`. Reuses `createEntitySelector()` + `filterEntities()` from `entityManagementUI.js`. Filters out already-linked items, removes "Create New" option. Search supported via `ca_link_item_search_` modal.

## Button IDs

| ID | Type | Purpose |
|---|---|---|
| `ca_linked_items_{actionId}` | Button | Opens item link sub-UI |
| `ca_link_item_select_{actionId}` | String Select | Pick item to link |
| `ca_unlink_item_{actionId}_{itemId}` | Button | Remove item link |
| `safari_use_linked_{itemId}` | Button | Direct-execute single linked action |
| `safari_item_uses_{itemId}` | String Select | Multi-use dispatch |

All registered in `BUTTON_REGISTRY` with wildcard patterns. Safari catch-all exclusions added for `safari_use_linked_` and `safari_item_uses_`.

## Files

| File | Key additions |
|---|---|
| `customActionUI.js` | `formatButtonLocations()`, `createCoordinateManagementUI()` LEAN redesign, `createItemLinkUI()`, renames (Action Editor, Actions, Button Locations) |
| `safariManager.js` | `getLinkedActions()`, `shouldConsumeItem()`, `hasUnclaimedSubActions()`, `consumeItemAfterAction()`, inventory display with use counting |
| `app.js` | 5 handlers + `ca_link_item_search_` modal, `linkedItems: []` default, safari catch-all exclusions |
| `buttonHandlerFactory.js` | 6 BUTTON_REGISTRY entries |
| `entityManagementUI.js` | Exported `createEntitySelector()` |

## Known Deviations from RaP

- `dynamicPatterns` array doesn't exist in codebase — wildcard BUTTON_REGISTRY entries handle debug system
- Use handlers are manual (not ButtonHandlerFactory) to support `DEFERRED_UPDATE_MESSAGE` + follow-up pattern
- `safari_action_editor` label was already "Actions" before implementation started
