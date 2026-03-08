# Tech Debt: Action Button Rendering (4 Independent Locations)

## Problem
4 places independently build Discord button components for Safari Actions. Each duplicates: trigger type filtering, custom_id prefix logic (`safari_` vs `modal_launcher_`), label/emoji/style cascade, Discord emoji parsing. Adding `button_modal` trigger type required patching all 4 — and we missed one (crafting menu), causing a bug.

## The 4 Locations

| # | File | Function/Handler | Context |
|---|------|-----------------|---------|
| 1 | `safariButtonHelper.js` | `createSafariButtonComponents()` | Anchor messages (map coordinates) |
| 2 | `app.js` | `entity_action_post_channel_select_` handler (~line 26970) | Post to Channel |
| 3 | `playerManagement.js` | Player menu action button loop (~line 894) | Player `/menu` |
| 4 | `safariManager.js` | `createCraftingMenuUI()` (~line 4604) | Crafting Menu |

## Fix
Extract `buildActionButtonComponent(guildId, actionId, action, options)` into `safariButtonHelper.js`. Replace all 4 call sites. Options param handles context differences (e.g., `inventoryConfig` overrides only apply for menu contexts, timestamp inclusion).

## Key Logic Each Location Duplicates
- Trigger type filter: `button` or `button_modal` renders; `modal`/`select`/`schedule` skip
- Custom ID: `button_modal` → `modal_launcher_{guildId}_{actionId}_{timestamp}`, else `safari_{guildId}_{actionId}[_{timestamp}]`
- Label cascade: `inventoryConfig.buttonLabel` > `trigger.button.label` > `action.name` > fallback
- Emoji: Unicode passthrough, Discord custom format parsing (`<:name:id>`), null handling
- Style: String-to-number mapping (`Primary`→1, `Secondary`→2, etc.)

## Risk: Low-Medium
Write tests first. Anchor buttons (#1) and Player Menu (#3) are highest traffic. Post to Channel (#2) and Crafting Menu (#4) are low traffic. Function is pure (builds a JSON object) — easy to test, easy to rollback.

## Task
Task #5 in task list. Step-by-step plan with per-step risk assessment exists in conversation history from 2026-03-08.
