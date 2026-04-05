# RaP 0924 — Super Player Menu: Unified Player Interface

**Date**: 2026-04-05
**Status**: SPECIFICATION — requirements captured, clarifications pending
**Affects**: playerManagement.js, app.js, playerCardMenu.js (prototype reference)
**Related**: [Challenge Actions RaP 0943](0943_20260316_ChallengeActions_Analysis.md), [CIF RaP 0933](0933_20260323_ComponentInteractionFactory_Analysis.md), [LEAN UI](../ui/LeanUserInterfaceDesign.md), [Security Architecture](../infrastructure-security/SecurityArchitecture.md), [ComponentsV2](../standards/ComponentsV2.md)

---

## 1. Original Context (User Prompt — 2026-04-05)

> The castlists actionRow is getting kindly ugly and takes up to 6 components, whilst only letting players see 5 castlists. Time to replace it with a string select like shown in pcard_open.
>
> Put on your best architect hat, what is re-usable from castlist_hub > castlist_select from a Component, Interaction and Data Perspective?
>
> The general goal here is to have a unified interface across all three, and whilst you don't need to consider or worry about this now, eventually subsume all of the features of safari_map_admin (another type of player menu - but this requires more thinking on my behalf).
>
> From a UI/UX perspective, we are looking to ensure all components are moved inside of a container and have the clean sort of design seen in admin_manage_player, with expanded functionality, consistency and ideally re-use between these.

---

## 2. The Three Menus Today

All three call `createPlayerManagementUI()` in `playerManagement.js` with different `mode` values:

| Entry Point | Handler | Mode | Who Sees It | Current Components |
|---|---|---|---|---|
| `/menu` (non-admin) | `player_menu` | `PLAYER` | Players | ~33-37/40 |
| Prod Menu → Player Menu | `prod_player_menu` | `PLAYER` | Admin viewing as player | Identical to above |
| Prod Menu → Players | `admin_manage_player` | `ADMIN` | Admins managing a player | ~28-35/40 |

**Current problems:**
- Castlist buttons waste 6 components showing only 5 castlists (should be a string select showing 24)
- Stats section renders permanently, eating 3-5 components regardless of whether the user wants to see it
- Player menu has inline action buttons that eat up to 10 components dynamically
- Store buttons are inline (1 per store) instead of a select
- The three UIs are structurally different despite sharing `createPlayerManagementUI()`
- No Challenges button in any menu

---

## 3. Target Layout — Unified Super Player Menu

All three menus share the same structure. Differences are gated by `mode` (PLAYER vs ADMIN) only where functionally necessary.

```
┌─ Container (accent: blue) ────────────────────────┐
│ ## CastBot | Player Menu                           │
│ -# or "Player Management | {Name}" for admin       │
│ ─────────────────────────────────────              │
│ [User Select] (admin only)                          │
│ ─────────────────────────────────────              │
│ [Player Info Section: avatar, name, pronouns, tz]  │
│                                                     │
│ ─────────────────────────────────────              │
│ ### ```✏️ Castlists & Profile```                   │
│ [Castlists] [Pronouns] [Timezone] [Age]            │
│                                                     │
│ ### ```🦁 Idol Hunts, Challenges and Safari```     │
│ [Inventory] [Challenges] [Crafting] [Actions] [Stores] │
│                                                     │
│ ### ```💎 Advanced```                               │
│ [Stats] [Commands] [Vanity*] [Navigate*]           │
│  * = conditional                                    │
│                                                     │
│ ─────────────────────────────────────              │
│ [▼ String Select (hot-swap based on active btn)]   │
│                                                     │
│ ### ```📊 Your Stats``` (only when Stats active)   │
│ ❤️ HP: ██░░░░ 2/10 ...                             │
│                                                     │
│ ─────────────────────────────────────              │
│ [← Menu*] [📜 Logs] [🦁 Guide]                    │
│  * = admin only                                     │
└────────────────────────────────────────────────────┘
```

**Component budget estimate:**
- Header + separator: 2
- User Select + separator (admin only): 3
- Player info section + separator: 4
- Section A (heading + action row): 2 + 5 = 7
- Section B (heading + action row): 2 + 5 = 7
- Section C (heading + action row): 2 + 4 = 6
- Separator + string select: 2 + 2 = 4
- Stats display (when active): 1
- Separator + bottom nav: 2 + 3 = 5
- **Total (admin, Stats active): ~38/40**
- **Total (player, no Stats): ~30/40**

---

## 4. Section Specifications

### 4A. ```✏️ Castlists & Profile```

**Buttons:** Castlists, Pronouns, Timezone, Age (4 buttons)

**Identical across all 3 menus.**

#### Castlists Button (^5)

When Castlists is active, the hot-swap string select shows:

| # | Option | Emoji | Description | On Click |
|---|---|---|---|---|
| 1 | Post Castlist | 📋 | Publicly post an interactive Castlist to the channel you are in. Use in subs for privacy. | `show_castlist2_default` — DEFERRED-NEW, PUBLIC (same as current button) |
| 2 | Compact Castlist | 🍒 | Posts an image version of the castlist | `compact_castlist_default` — DEFERRED-UPDATE (same as current button) |
| 3-24 | {Castlist Name} | 🏃 | {Season name or description} | `show_castlist2_{castlistId}` — DEFERRED-NEW, PUBLIC |
| 25 (if ≥25) | ❌ Max Castlists shown | ❌ | Only showing 24 most recent | No-op |

**Sorting:** By last updated (newest first), matching `castlist_hub > castlist_select` pattern.

**Reuse from castlist_hub:**
- **Data:** `extractCastlistData()` from `castlistV2.js` — already used in both `playerManagement.js` and `playerCardMenu.js`. Returns `allCastlists` Map with metadata.
- **Select options:** The option-building pattern from `castlist_hub_main` handler (castlist name, emoji, season description). Can be extracted into a shared function.
- **Interaction handlers:** `show_castlist2_*` and `compact_castlist_*` already exist and work. No new handlers needed — the string select values map directly to these existing custom_ids.
- **Component:** The pcard_open `case 'castlists'` in `buildCardSelect` already builds this exact select with the right options. Can be lifted directly.

#### Pronouns/Timezone/Age

Same as current implementation. Hot-swap select shows role select (pronouns/timezone) or age select. No changes to handler logic.

### 4B. ```🦁 Idol Hunts, Challenges and Safari```

**Conditional section:** If no buttons would render (no inventory, no challenges, no crafting, no actions, no stores), hide the entire section heading + action row.

**Buttons (each conditional):**

#### 1. Inventory Button
- **Shows when:** Player is initialized AND inventory visibility mode allows it (respects `inventoryVisibilityMode` setting from `safari_player_menu_config`)
- **Label:** Uses server-specific `inventoryName` and `inventoryEmoji` from `getCustomTerms(guildId)`
- **On click:** IMMEDIATE-NEW, EPHEMERAL — opens full inventory display (same as current `safari_player_inventory`)
- **Does NOT hot-swap** — inventory is its own full-screen ephemeral message
- **Identical behavior across all 3 menus**

#### 2. Challenges Button (NEW)
- **Shows when:** Guild has any challenges with linked actions visible to this player
- **On click:** Hot-swap select shows challenge actions (UPDATE_MESSAGE, same paradigm as Castlists/Actions/Stores)
- **Visibility filtering:** `playerAll` (everyone), `playerIndividual[thisPlayerId]` (assigned only), `tribe[roleId]` (role check), never `host`
- **Admin mode:** Must have a player selected; shows that player's visible actions
- **String select options:** Action name as label, challenge title in description, action emoji
- **On action select:** Execute action via standard `challenge_{guildId}_{actionId}_{timestamp}` or `modal_launcher_` pattern

#### 3. Crafting Button
- **Shows when:** Server has crafting actions configured (`menuVisibility === 'crafting_menu'`)
- **On click:** Hot-swap select shows crafting recipes
- **String select:** Up to 24 recipes, ordered by sortOrder then name
- **Error handling:** If ≥24 recipes, first option: `❌ Max Crafting Recipes Reached` with description "Only showing most recently updated 24 recipes"
- **On recipe select:** Execute crafting action (same as current `safari_crafting_menu` button behavior)
- **Reuse from pcard_open:** `case 'crafting'` in `buildCardSelect` already builds this

#### 4. Actions Button
- **Shows when:** Server has player menu actions configured (`menuVisibility === 'player_menu'`)
- **On click:** Hot-swap select shows player menu actions
- **String select:** Up to 24 actions, ordered by sortOrder then name
- **Error handling:** If ≥24 actions, first option: `❌ Max Actions shown` with description "Only showing most recently updated 24 actions"
- **On action select:** Execute action (same as current inline button behavior, using `safari_{guildId}_{actionId}` or `modal_launcher_` prefix)
- **Replaces** current inline action buttons that eat up to 10 components
- **Reuse from pcard_open:** `case 'actions'` in `buildCardSelect` already builds this

#### 5. Stores Button
- **Shows when:** Guild has global stores configured AND `globalStoresVisibilityMode` allows it (respects `always`/`initialized_only`/`never` settings)
- **On click:** Hot-swap select shows global stores
- **String select:** Up to 24 stores, ordered by most recently updated
- **Error handling:** If ≥24 stores, first option: `❌ Max Stores shown`
- **On store select:** Execute `safari_store_browse_{guildId}_{storeId}` — opens store browse (IMMEDIATE-NEW, EPHEMERAL)
- **Reuse from pcard_open:** `case 'stores'` in `buildCardSelect` already builds this

### 4C. ```💎 Advanced```

**Buttons (each conditional):**

#### 1. Stats Button
- **Shows when:** Guild has attributes configured (`getAttributeDefinitions(guildId)` returns entries)
- **Shown on all 3 menus**
- **On click:** Button turns blue (active), hot-swap select shows attributes
- **String select:**
  - Placeholder: `📊 Click to view Attributes..`
  - Options: Same as current `admin_integrated_attributes_*` design
  - Description format: `{current} / {max} {name}` for resources (e.g., `2 / 10 HP`), `{value} {name}` for stats (e.g., `4 Strength`)
  - Include Stamina as per current admin UI
- **Below the select:** Stats display with triple backtick heading: `` ### ```📊 Your Stats``` `` (or `{Name}'s Stats` for admin)
- **Stats display only shows when Stats button is active** — removed from permanent rendering
- **On select option click:**
  - **Player mode:** No-op (view-only, nice UI to see stat values)
  - **Admin mode:** Opens attribute modify modal (same as current `admin_integrated_attributes_*` handler)
- **Security:** Player-mode select handler must verify `!hasAdminPermissions()` before allowing attribute modification. The handler prefix changes: `player_set_attributes` for player mode, `admin_set_attributes_{userId}` for admin mode.

#### 2. Commands Button
- **Shows when:** `enableGlobalCommands` is true in server settings
- **On click:** Opens command entry modal (same as current `player_enter_command_global`)
- **Does NOT hot-swap** — modal opens directly

#### 3. Vanity Roles Button
- **Shows when:** Admin mode only (ADMIN)
- **On click:** Hot-swap select → Role Select for vanity roles
- **Same as current `admin_manage_vanity_*` behavior**

#### 4. Navigate Button
- **Shows when:** Player is initialized on map (same current logic)
- **On click:** Opens movement UI (DEFERRED-NEW, EPHEMERAL — same as current `safari_navigate_*`)
- **Does NOT hot-swap** — navigate is its own screen
- **When active:** String select shows disabled placeholder "Navigate opens in a new message"

### 4D. Bottom ActionRow

- **Separator** first (always)
- **← Menu** button (admin mode only — routes to `prod_menu_back`)
- **📜 Logs** button (all modes, when player is initialized)
- **🦁 Guide** button (all modes, when player is initialized)

---

## 5. Reuse Analysis — What Exists vs What's New

### From pcard_open (playerCardMenu.js) — Lift Directly

| Feature | pcard_open Location | Status |
|---|---|---|
| Castlist string select | `case 'castlists'` (line ~302) | ✅ Ready to lift |
| Crafting string select | `case 'crafting'` (line ~487) | ✅ Ready to lift |
| Actions string select | `case 'actions'` (line ~510) | ✅ Ready to lift |
| Stores string select | `case 'stores'` (line ~533) | ✅ Ready to lift |
| Stats string select | `case 'attributes'` (line ~508) | ✅ Ready to lift |
| Hot-swap button pattern | `buildCategoryRow()` (line ~55) | Pattern reference |
| Select option building | Various cases | Pattern reference |

### From castlist_hub (castlistV2.js / app.js) — Reuse Handlers

| Feature | Location | Reuse |
|---|---|---|
| `extractCastlistData()` | `castlistV2.js` | Data loading — already shared |
| `show_castlist2_*` handler | app.js | Handler — no changes needed |
| `compact_castlist_*` handler | app.js | Handler — no changes needed |
| Castlist sorting/limiting | `playerManagement.js:540-570` | Sorting logic — extract to shared function |

### From challengeActionCreate.js — Already Built

| Feature | Function | Status |
|---|---|---|
| Challenge action visibility | `getChallengeActions()` | ✅ Built |
| Access gating | `verifyChallengeActionAccess()` | ✅ Built |
| Action select building | `buildChallengeActionSelect()` | ✅ Built (for host UI, adapt for player) |

### New Code Needed

| Feature | What's New |
|---|---|
| Section rendering with conditional visibility | Build section only if buttons exist |
| ≥24 error handling pattern | Reusable: first option shows error, rest are most recent |
| Stats display below select (conditional) | Move from permanent to active-only |
| Challenges hot-swap select | Challenge actions in string select (UPDATE_MESSAGE, not IMMEDIATE-NEW) |
| Player-mode attribute select (no-op on click) | New handler or mode check in existing |

---

## 6. Design Considerations

### DC1: Castlist "Post" from String Select — Response Type Mismatch

**Issue:** String selects default to UPDATE_MESSAGE. But "Post Castlist" needs DEFERRED-NEW (public follow-up). When a player selects "Post Castlist" from the hot-swap select, the handler needs to:
1. Acknowledge with a deferred response
2. Post the castlist as a public follow-up
3. Update the original menu to deselect

**Recommendation:** The select handler detects the `show_castlist2_*` value and routes to a deferred-new flow. This is the same pattern used in the current button-based castlist — just triggered from a select instead of a button. The existing `show_castlist2_*` handler already handles the full flow.

### DC2: Hot-Swap Area — One Select vs Multiple

**Issue:** Some buttons need a string select (Castlists, Crafting, Actions, Stores, Stats), some need a role select (Vanity, Pronouns, Timezone), some open a new message (Inventory, Challenges, Navigate, Commands). Having a single hot-swap area means only ONE select is visible at a time.

**Recommendation:** Keep the single hot-swap area pattern from pcard_open. Buttons that open new messages (Inventory, Challenges, Navigate, Commands) don't swap the select — they trigger IMMEDIATE-NEW or modals. The string select is only swapped by: Castlists, Crafting, Actions, Stores, Stats, Age, Pronouns, Timezone, Vanity.

### DC3: Component Budget When All Sections Visible

**Worst case (admin, player initialized, all features configured):**
- Header + separator: 2
- User Select + separator: 3
- Player info (section + text): 4
- Section A (heading + 4 buttons): 6
- Section B (heading + 5 buttons): 7
- Section C (heading + 4 buttons): 6
- Separator + string select: 3
- Stats display (when active): 1
- Separator + bottom nav (3 buttons): 5
- **Total: ~37/40** ✅

**Without admin user select and ← Menu: ~32/40** ✅

### DC4: Active Button State Across Sections

**Issue:** If Stats (Section C) is active and the user clicks Castlists (Section A), Stats should deactivate and Castlists should activate. Only one button can be active at a time across all sections.

**Recommendation:** Same pattern as pcard_open — `activeButton` state is global, all button rows rebuild with the correct active styling on every render.

### DC5: Inventory/Challenges/Navigate/Commands Don't Hot-Swap

These buttons open separate screens (IMMEDIATE-NEW) or modals. They should:
- NOT turn blue (no active state)
- NOT change the string select
- Keep whichever select was previously showing

**Recommendation:** These buttons use different custom_id patterns that don't pass through the hot-swap rebuild. They trigger their own responses. The menu doesn't re-render.

Actually, for consistency: when these buttons are clicked, the factory creates a NEW message (not updateMessage). The original menu stays unchanged. This is already how Inventory and Navigate work.

---

## 7. Ambiguities Between Menu Variants

| Feature | player_menu / prod_player_menu | admin_manage_player | Resolution Needed? |
|---|---|---|---|
| User Select | Not shown | Shown at top | ✅ Already gated by mode |
| Vanity Roles button | Not shown | Shown in Advanced | ✅ Already gated by mode |
| ← Menu button | Not shown | Shown in bottom nav | ✅ Already gated by mode |
| Stats select click | No-op (view only) | Opens modify modal | ⚠️ Need mode check in handler |
| Challenges button | Shows own visible actions | Shows selected player's visible actions | ⚠️ Admin needs player context |
| Navigate button | Uses own userId | Uses selected targetMember userId | ✅ Already parameterized |
| Castlists Post | Posts to current channel | Posts to current channel | ✅ Same behavior |

---

## 8. Resolved Questions

| # | Question | Answer |
|---|---|---|
| Q1 | Challenges: ephemeral modal or message? | **UPDATE_MESSAGE** — Challenges is a hot-swap button like Castlists/Actions/Stores. Updates the string select, does NOT create a new message. |
| Q2 | Admin with no player selected? | **Greyed out buttons + greyed select.** Pre-calculate: if a feature is never available (no crafting configured), hide button entirely. If it could be available (crafting exists), show greyed out. |
| Q3 | Castlist options 3-24 — all Post publicly? | **Yes.** All use `show_castlist2_{castlistId}` handler — public post via DEFERRED-NEW. |
| Q4 | IMMEDIATE-NEW buttons — menu stays as-is? | **Yes.** Only Inventory, Navigate, Commands create new messages. Menu stays. |
| Q5 | Admin section headers same as player? | **Yes.** Same headers across all 3 menus. |
| Q6 | CastlistArchitecture.md update needed? | **Yes.** Update with string select design + CIF patterns. |

---

## 9. Implementation Phases (Preliminary)

| Phase | Scope | Depends On |
|---|---|---|
| **1** | Restructure `createPlayerManagementUI`: 3 sections, conditional buttons, shared button builder | None |
| **2** | Hot-swap select: lift pcard_open patterns into playerManagement.js, castlist select with Post/Compact | Phase 1 |
| **3** | Challenges button: IMMEDIATE-NEW ephemeral with challenge action select | Phase 1, Challenge Actions (built) |
| **4** | Stats below select: move from permanent to active-only, mode-aware select handler | Phase 1 |
| **5** | ≥24 error handling: shared pattern for Castlists, Crafting, Actions, Stores | Phase 2 |
| **6** | Cleanup: remove inline castlist buttons, inline action buttons, inline store buttons from old code | Phase 2 |
| **7** | pcard_open alignment: update prototype to match production (or deprecate) | Phase 6 |

---

## 10. Prototype Reference

The pcard_open prototype (`playerCardMenu.js`) already implements most of the hot-swap patterns described here. Key functions to reference/lift:

- `buildCategoryRow()` — button row builder with active state highlighting
- `buildCardSelect()` — switch statement mapping active button to select content
- `wrapSelect()` — utility to wrap options in a StringSelect ActionRow
- `buildDisabledSelect()` — disabled placeholder select

The production build should extract reusable patterns from pcard_open into shared functions rather than duplicating code. The pcard_open file can be deprecated after production ships.
