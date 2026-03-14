# Extract Tribe Handlers from app.js

**Status:** Planned, not started
**Priority:** Medium — tech debt reduction, no user-facing changes
**Effort:** ~2 hours across 5 phases

## Context

app.js is 45,692 lines. The tribe swap/merge modal handler is 598 lines of complex business logic inline — one of the fattest handlers in the file. There are 5 other tribe handlers nearby. Total extraction: ~1,082 lines out of app.js into a new `tribeHandlers.js` module.

This is a refactor, not a rewrite. Business logic doesn't change, it just moves.

## New File: `tribeHandlers.js`

**Exports:**

| Function | Source | Lines |
|---|---|---|
| `getModalFieldValue(components, customId)` | Duplicated 3x in tribe handlers | ~20 |
| `handleTribeSwapMergeModal(req, res, client)` | app.js:37314-37911 | 598 |
| `handleTribeAddModal(req, res, client)` | app.js:37912-38028 | 117 |
| `handleTribeEditModal(req, res, client)` | app.js:38029-38250 | 222 |
| `buildTribeEditModal(guildId, roleId, castlistId, client)` | Inside factory handler ~9676 | ~115 |
| `buildTribeAddModal(castlistId)` | Inside factory handler ~9804 | ~90 |

## app.js After (thin routing stubs)

```javascript
// Modal submissions — 3 lines each instead of 100-600
} else if (custom_id === 'tribe_swap_merge_modal') {
  const { handleTribeSwapMergeModal } = await import('./tribeHandlers.js');
  return handleTribeSwapMergeModal(req, res, client);

} else if (custom_id.startsWith('tribe_add_modal|')) {
  const { handleTribeAddModal } = await import('./tribeHandlers.js');
  return handleTribeAddModal(req, res, client);

} else if (custom_id.startsWith('tribe_edit_modal|')) {
  const { handleTribeEditModal } = await import('./tribeHandlers.js');
  return handleTribeEditModal(req, res, client);
```

Button handlers stay as ButtonHandlerFactory but call extracted modal builders:
```javascript
// Inside existing factory handler for tribe_edit_button|
const { buildTribeEditModal } = await import('./tribeHandlers.js');
return buildTribeEditModal(context.guildId, roleId, castlistId, client);
```

`castlist_swap_merge_` button handler stays as-is (already factory, validation is coupled to modal building).

## Extraction Order (5 phases, one dev-restart each)

1. **Shared utility** — Create `tribeHandlers.js` with `getModalFieldValue()`. No app.js changes yet.
2. **tribe_edit_modal** — Lowest complexity, proven two-phase hub pattern. Test: edit tribe name/emoji/color/members.
3. **tribe_add_modal** — Similar to edit, simpler. Test: add new tribe, verify role creation.
4. **tribe_swap_merge_modal** — Most complex, highest risk. Test: swap with auto-randomize ON and OFF, verify archive, vanity roles, ceremony.
5. **Modal builders** — Extract `buildTribeEditModal` and `buildTribeAddModal` from button handlers.

## Why NOT ButtonHandlerFactory for modal submissions

- `tribe_swap_merge_modal` sends validation errors BEFORE deferred response, then posts multiple REST API ceremony messages, then follow-up. Factory can't orchestrate this.
- `tribe_add_modal` and `tribe_edit_modal` use `DEFERRED_UPDATE_MESSAGE` + `twoPhaseHubResponse`. Requires direct `res.send()` control.
- This matches `castlistHandlers.js` precedent exactly.

## Key Imports for tribeHandlers.js

- `loadPlayerData`, `savePlayerData` from `./storage.js`
- `populateTribeData`, `formatRoleColor`, `validateHexColor`, `TRIBE_COLOR_PRESETS` from `./utils/tribeDataUtils.js`
- `twoPhaseHubResponse` from `./castlistHandlers.js`
- `updateDeferredResponse` from `./buttonHandlerFactory.js`
- `InteractionResponseType`, `InteractionResponseFlags` from `discord-interactions`

## Gotchas

- **Single load-mutate-save cycle**: swap/merge loads playerData once, mutates across archive + tribes + vanity roles, saves once. Must stay atomic.
- **`res.send()` timing**: Validation errors sent before deferred response. Extracted function needs `res` directly.
- **`getFieldValue` differences**: Three versions have slightly different null handling. Standardise on returning `null`, callers provide defaults.
- **`process.env` access**: DISCORD_TOKEN and DISCORD_APP_ID used in ceremony REST calls — fine, read at call time.

## Tests: `tests/tribeHandlers.test.js`

- `getModalFieldValue`: Label wrapper, ActionRow wrapper, missing ID, values array
- `shuffleArray`: Same length, same elements, no mutation (extract as named export)
- Archive castlist ID generation
- Vanity role idempotency (no duplicates)

## Net Impact

- **app.js**: -1,082 lines (45,692 → 44,610)
- **New file**: tribeHandlers.js (~1,100 lines)
- **Legacy handler count**: Unchanged (these are modal submissions, already counted)
