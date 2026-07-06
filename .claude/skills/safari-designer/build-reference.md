# Safari Build Reference (Claude-only)

> Internal companion to `safari-design-guide.md`. Real menu paths, `custom_id`s, data shapes, and hard
> limits for *actually building* a designed Safari in CastBot, plus where the code lives.
> **Do NOT paste this into anything a user feeds to ChatGPT** — it's code-coupled. Line numbers drift;
> verify against live code before quoting specifics. Verified against `main`, 2026-06-30.

## Entry points
- No `/safari` command exists. Everything is `/menu` (admin) → buttons. `/menu` → `app.js:3017`,
  branches on `hasAdminPermissions`. Admin production menu builder `createProductionMenuInterface`
  (`app.js:860`). Preview player view via `prod_player_menu` (`app.js:970`).
- Production-menu Safari row (`app.js:935-941`): 🏪 Stores `safari_store_manage_items` · 📦 Items
  `safari_manage_items` · 💰 Currency `safari_manage_currency` · ⚡ Actions `safari_action_editor` ·
  🗺️ Map `safari_map_explorer`. 🏃 Challenges = `challenge_screen` (`app.js:930`). ⚙️ Settings =
  `castbot_settings`. 🪛 Tools `castbot_tools` (holds `nuke_safari_content`).

## Settings — `castbot_settings` → `createSafariCustomizationUI` (`safariConfigUI.js:80`)
Field-group buttons `safari_config_group_{key}` → modal `safari_config_modal_{key}` (`editFramework.js:141-186`):
- `currency`: currencyName*, currencyEmoji, inventoryName*, inventoryEmoji, defaultStartingCurrencyValue (default 100)
- `crafting`: craftingName* (def "Crafting"), craftingEmoji (def 🛠️)
- `location`: defaultStartingCoordinate (def A1)
- `events`/`rounds`: legacy Tycoons.
- Stamina via `stamina_location_config` → `getStaminaConfig(guildId)` (`safariManager.js`): startingStamina, maxStamina, staminaRegenerationMinutes. Defaults: start 1, max 10, regen 60min (full reset). Currency defaults: name "Dollars", emoji 🪙.

## Map — `safari_map_explorer` → `buildMapExplorerResponse` (`mapExplorer.js:2170`)
- Create/Update: `map_update` → modal `map_update_modal` (`app.js:32920`): `map_url` (Discord CDN image, required), `map_rows` (height, def 7), `map_columns` (width, def 7), `map_emoji` (new maps only). Build fn `createMapGridWithCustomImage` (`mapExplorer.js:1259`).
- Delete: `map_delete` → `map_delete_confirm`. Blacklist: `map_admin_blacklist` → modal `map_admin_blacklist_modal` (`safariMapAdmin.js:862-921`), comma-separated coords.
- Coords: `generateCoordinate(x,y)` = `${ExcelColumn(x)}${y+1}` (`mapExplorer.js:50`). **Blacklist/reverse-blacklist/start parsers accept single-letter only** (`^[A-Z]\d+$`) → keep ≤26 cols. Grid 1–100/dim, **≤400 total cells** (`app.js:51011/51024`). **No resize after creation** (`app.js:51050-51071`).
- Data: `safariContent[guildId].maps.active` (id pointer) + `maps[mapId]` = {gridWidth, gridHeight, imageFile, category, blacklistedCoordinates[], coordinates{ COORD: {channelId, anchorMessageId, emoji, baseContent{title,description,image}, stores[], itemDrops[], currencyDrops[], buttons[] }}}. Player progress in `playerData[guildId].players[uid].safari.mapProgress[mapId]` = {currentLocation, exploredCoordinates[], itemsFound[], movementHistory[]}.
- Movement: adjacent_8 (default) / cardinal_4 (`mapMovement.js:111-160`). Player: `safari_navigate_{uid}_{coord}` → `safari_move_{targetCoord}`. Stamina cost from `pointsConfig.movementCost.stamina` (def 1). Fog of war: only current cell's channel visible; grant-new-then-revoke-old on move.
- Cell authoring: in the cell's channel anchor → 📍 Location Actions `map_location_actions_{coord}` (`app.js:33409`) opens the map_cell entity editor. Field groups (`entityManagementUI.js:700`): `info` (title/description/image/emoji), `stores`. Quick-create: `quick_text_{coord}`, `quick_currency_`, `quick_item_`, `quick_enemy_`, `quick_command_`, `quick_crafting_`. Drops: `map_add_item_drop_{coord}` / `map_add_currency_drop_{coord}`; dropType ∈ `once_per_player` (claimedBy array) | `once_per_season` (claimedBy string).

## Reverse blacklist (the unlock mechanic)
- Item field `reverseBlacklist: string[]` of coords. Set via Items → item → **Movement** field group (`entity_field_group_item_{id}_stamina`; group label "Movement", fields staminaBoost/reverseBlacklist/consumable; `entityManagementUI.js:681`). Input parsed comma-sep, uppercased, `^[A-Z]\d+$`.
- **Must ALSO be in the map's `blacklistedCoordinates`** or the item does nothing (legend warns). Binary (qty 1 = unlock), global to all holders, union across items, not consumed. Validation server-side in `movePlayer` (`mapMovement.js:213-228`); coverage `getPlayerReverseBlacklistCoverage` (`mapMovement.js:666-698`). Reverse-blacklist **wins** over blacklist. Movement still requires adjacency.

## Items — `safari_manage_items` (entity UI, `entityManagementUI.js:145`)
- Create: select `➕ Create New` → modal `entity_create_modal_item_info` (asks name, emoji, description, stamina boost, base price). Edit: field-group buttons `entity_field_group_item_{id}_{group}`. Groups (`entityManagementUI.js:677-682`): info, financials (basePrice, good/badOutcomeValue), battle (attack/defense), properties (consumable, defaultItem — **select menus**), stamina/Movement (staminaBoost, reverseBlacklist, consumable), stats (attributeModifiers).
- Schema (`safariManager.js:2606-2630`): id, name, description, emoji (def 📦, **no image field**), category, basePrice (def 100), maxQuantity (per-player cap, -1=unlimited), goodOutcomeValue, badOutcomeValue, attackValue, defenseValue, consumable ('Yes'|'No' string), staminaBoost (0–10), reverseBlacklist[], attributeModifiers[{attributeId,operation:add|addMax,value}], tags (≤5), metadata.defaultItem ('Yes' auto-grants on init).
- Inventory: `playerData[guildId].players[uid].safari.inventory[itemId]` = {quantity, numAttacksAvailable}. Display 10/page (`safariManager.js:4453`).
- Limits (`config/safariLimits.js`): 200 items/guild, name 80, desc 500.

## Actions — `safari_action_editor` (global) / per-cell list; editor `customActionUI.js`
- Data: `safariContent[guildId].buttons[actionId]` = {name, description, trigger{type, button{label,emoji,style}, phrases[]}, conditions[] (ARRAY at runtime — `Array.isArray` guard), actions[] (outcomes), coordinates[] ([]=global), menuVisibility}.
- Trigger types (`customActionUI.js:1351-1387`; select `custom_action_trigger_type_{id}`): `button`, `modal` (=typed command phrase, ≤8 phrases), `button_modal` (button + **secret code** → code puzzles), `button_input` (button + free text → `{triggerInput}`), `schedule`.
- Outcome types (editor select `customActionUI.js:16-28`; add via `safari_action_type_select_{id}_{branch}`, branch ∈ always|true|false; execution switch `safariManager.js:1898-2218`): `display_text` (title/content/accentColor/imageUrl), `give_currency` (**signed amount**, message, limit — NO operation field), `give_item` (itemId/quantity/operation give|remove/limit), `give_role`/`remove_role` (roleId), `modify_attribute` (attributeId/add|subtract|set/amount/limit), `follow_up_button` (→ actionId, bundles with prior display_text), `move_player` (config.coordinate — teleport), `manage_player_state` (init/teleport/deinit), `fight_enemy` (win/lose overrides branch), `calculate_results`/`calculate_attack` (Tycoons), `store_display`, `random_outcome`, `check_points`/`modify_points` (LIVE).
- Conditions (`safariManager.js:10459-10615`; enum `:404-420`): `item` (has/not_has, quantity), `currency` (gte/lte/eq_zero, value), `role` (has/not_has), `attribute_check`/`attribute_compare`/`multi_attribute_check`, `d20_roll` (dc, modifier), `random_probability` (passPercent). Per-condition AND/OR. Branch result picks true/false outcomes; `always` outcomes run first.
- Usage limits (on give_currency/give_item/modify_attribute/fight_enemy; `outcome.config.limit`; `SafariUsageLimits.md`): `unlimited`, `once_per_player` (claimedBy[]), `once_globally` (claimedBy string), `once_per_period` (claimedBy{uid:ts}+periodMs), `custom` (maxClaims×scope×unique×reset). Templates ≤5/guild. Admin Player-Claims UI to reset.
- Editor custom_ids: trigger `entity_action_trigger_{id}` / modal `custom_action_trigger_modal_{id}`; coords `entity_action_coords_{id}`; conditions `condition_manager_{id}_0`; post to channel `action_post_channel_{id}`; delete `custom_action_delete_{id}`.
- Limits: **6 outcomes/action** (MAX_ACTIONS_PER_BUTTON, component-budget enforced), 100 actions/guild, label 80, content 2000, title 100, 40-component Discord cap.

## Crafting — Action with `menuVisibility:'crafting_menu'`
- Quick Crafting modal (`quickActionCreate.js`): button name + item1 + item2 + output + emoji → auto-builds Action (Grey, crafting_menu, 2 `item` has-conditions, 3 outcomes: remove input ×2 + give output ×1). Same-item picks collapse to qty 2. **No fail outcome auto-added.** Button: `quick_crafting_global` (or per-coord).
- Manual: any Action → Coordinate Management → Menu Visibility select (`menu_visibility_select_*`, `app.js:31257`) → "Crafting".
- Player surfaces: Inventory → 🛠️ Crafting `safari_crafting_menu_{guildId}` (`createCraftingMenuUI` `safariManager.js:4835`, ≤15 buttons), and player-card crafting select (≤23). **Gotcha: the menu shows only the recipe NAME** (label fallback inventoryConfig.buttonLabel→trigger.button.label→action.name; description is generic "{craftingName} recipe") — inputs/output are NOT shown. Encode ingredients in the recipe name.

## Stores / Currency
- Stores: `safariContent[guildId].stores[storeId]` = {name, emoji, description, items[itemId], settings.storeownerText, accentColor, requiresRole}. Create via shared `createStoreModal` (`safariManager.js:10893`); add items `safari_store_add_item_{storeId}::{itemId}`. Buy deducts basePrice from currency (clamped ≥0); blocked if insufficient. Limits: 50 stores/guild, 23 items/store, stock undefined/-1 = unlimited.
- Currency: `playerData[...].safari.currency`; `getCurrency` `:737`, `updateCurrency` `:889` (Math.max(0, cur+amount) — floor 0, no ceiling). Names via `getCustomTerms` `:5336`.

## Attributes / stamina
- `pointsManager.js`; stored at `safariContent[guildId].entityPoints["player_{uid}"].{type}` = {current, max, lastRegeneration, lastUse, charges?}. Stamina only fully-wired type; custom stats supported. On-demand regen (full_reset / incremental / per-charge). Non-consumable items with staminaBoost raise max; consumable add bonus current. Outcomes `modify_points`/`check_points`, conditions attribute_*.

## Challenge + Timer
- Challenge entity: `playerData[guildId].challenges[challengeId]` (`challengeManager.js`); menu `challenge_screen`. Statuses testing🧪/active🏁/paused⏯️. Actions in categories playerAll/playerIndividual/tribe/host.
- Quick Challenge Action modal (`challengeActionCreate.js:285-300`): last field **Challenge Timer** select `timer_mode` — `none` (♾️) / `timed` (⏱️). Saved to `link.timer` + `metadata.challengeTimer`.
- Timed execution (`app.js:9777-9917`): posts "🚦 Challenge Timer Started" with live `<t:…:R>` clock + red **🛑 Finish / Stop Timer** button `challenge_timer_stop`; stop computes elapsed via snowflake math (`timerUtils.js`, `timeBetweenSnowflakes`), shows "3m 45s" + "0:03:45". No stored start time. (Stale docs say "not built" — it is built.)

## Lifecycle
- Init: Map Explorer → **Start Safari** `safari_start_safari` → user select `safari_start_user_select` → `safari_start_safari_go` → `bulkInitializePlayers` → `initializePlayerOnMap` (`safariMapAdmin.js:336`): assigns start (per-player override → server default → A1), ADDS defaultStartingCurrencyValue, grants defaultItem items, sets stamina, grants start channel, posts welcome+Navigate. Self-init: `safari_map_init_player`.
- Starting location: per-player `playerData[...].safari.mapProgress[mapId].startingLocation` (modal `safari_starting_info_modal_{uid}`); server default `safariConfig.defaultStartingCoordinate`. Start cell is NOT blacklist-checked.
- Deinit: `safari_deinit_confirm_{uid}` (`safariDeinitialization.js:211`); bulk `safari_remove_players`. Guild wipe: `nuke_safari_content`.
- Admin overview: 🚀 Safari Progress `safari_progress` (`safariProgress.js`) — per-row view of actions/drops/claims (read-only audit).

## Canonical build order
1. Settings (currency, start coord, stamina, crafting name) → 2. Create map → 3. Items (incl. flag items; set reverse-blacklist on keys) → 4. Stores → 5. Currency baseline → 6. Blacklist gated cells → 7. Actions (trigger, outcomes, conditions, usage limits) → 8. Place actions on cells / wire follow-ups → 9. Quick Crafting → 10. Enemies (if combat) → 11. Challenge+timer (if timed) → 12. Start Safari (select players) → 13. Playtest as player, iterate.

## Key files
`app.js` (router, prod menu :860, /menu :3017, timer :9777), `safariConfigUI.js` (settings), `entityManagementUI.js` + `editFramework.js` + `fieldEditors.js` (items/stores/actions/enemies/cells CRUD + schemas), `safariManager.js` (core, items :2606, inventory :4453, currency :737/:889, crafting menu :4835, store modal :10893, conditions :10459, outcomes :1898), `mapExplorer.js` (map+blacklist), `mapMovement.js` (movement+reverse-blacklist+location), `safariMapAdmin.js` (admin map+init), `customActionUI.js` (actions/triggers/outcomes UI), `quickActionCreate.js` (quick crafting), `challengeActionCreate.js`+`challengeManager.js` (challenges+timer), `pointsManager.js` (attributes/stamina), `safariStartSafari.js`+`safariDeinitialization.js` (lifecycle), `playerManagement.js` (player view+gating). Docs: `docs/03-features/Safari*.md`, `Crafting.md`, `SafariReverseBlacklist.md`, `SafariUsageLimits.md`, `Attributes.md`, `OLD_Challenges.md`.
