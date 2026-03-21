# RaP 0935: Castlist Handler Factory Migration

**Date**: 2026-03-21
**Status**: Analysis Complete, Awaiting Decision
**Risk**: HIGH (core feature, 140+ production servers)
**Trigger**: `[🪨 LEGACY]` showing on every castlist display — the most-used feature in the bot

## Original Context

> "But what's really happening here? What makes this Post Castlist button any more or less special than the other ones that use the FACTORY?"

The castlist system has 25 handlers. 17 already use the factory. 3 don't. 4 are modal submits (legitimately exempt). 1 is routing glue. The 3 legacy handlers are also the 3 most important: the main display, navigation, and tribe pagination.

## The Lay of the Land

### What's Already Migrated (17 handlers)

| Handler | Lines | Pattern |
|---|---|---|
| `castlist_hub` | 16 | Factory, ephemeral |
| `castlist_hub_main` | 20 | Factory, updateMessage |
| `castlist_hub_main_new` | 25 | Factory, ephemeral |
| `castlist_select` | 138 | Factory (in castlistHandlers.js) |
| `castlist_delete_*` | 173 | Factory (in castlistHandlers.js) |
| `castlist_tribe_select_*` | 96 | Factory, deferred |
| `compact_castlist_*` | 58 | Factory, deferred |
| `castlist_swap_merge_*` | 68 | Factory, modal |
| `edit_placement_*` | 97 | Factory, modal |
| `tribe_edit_button\|*` | 157 | Factory, modal |
| `tribe_add_button\|*` | 99 | Factory, modal |
| `season_post_button_*` | 55 | Factory, modal |
| `castlist_view_*` | — | Factory (via handleCastlistButton) |
| `castlist_edit_info_*` | — | Factory (via handleCastlistButton) |
| `castlist_placements_*` | — | Factory (via handleCastlistButton) |
| `castlist_order_*` | — | Factory (via handleCastlistButton) |
| `castlist_sort_*` | 29 | Factory (in castlistHandlers.js) |

### What's Legacy (3 handlers — THE core ones)

| Handler | Lines | Why It's Legacy |
|---|---|---|
| `show_castlist2_*` | 133 | Deferred + webhook follow-up |
| `castlist2_nav_*` | 141 | Deferred update + webhook PATCH |
| `castlist2_tribe_prev/next_*` | 160+ | Discord.js builders + direct API |

### What's Modal Submit (4 handlers — legitimately exempt)

| Handler | Lines | Location |
|---|---|---|
| `save_placement_*` | 300+ | app.js modal submit section |
| `edit_info_modal_*` | 137 | castlistHandlers.js |
| `castlist_order_modal_*` | 71 | castlistHandlers.js |
| `castlist_create_new_modal` | — | castlistHandlers.js |

## Why These 3 Aren't Using Factory

### The PhD Version

All three use a **deferred response + webhook** pattern. The interaction flow is:

```
1. Discord sends interaction (3-second clock starts)
2. Handler sends DEFERRED response immediately (clock stops)
3. Handler does heavy work (member fetch, sorting, layout)
4. Handler sends final response via webhook PATCH/POST
```

The factory expects: handler returns data → factory sends response. One step. The legacy handlers need TWO steps: acknowledge fast, respond later. The factory's `deferred: true` option does support this, but it always PATCHes `@original`. `show_castlist2` needs to POST a follow-up (new message) instead.

### The ELI5 Version

The factory knows how to put food on one table. These handlers need to wave at the customer first ("I'll be right with you!"), cook the food, then carry it to a completely different table. The factory recently learned how to carry food to different tables (`updateMessage: false`), but nobody told the chef.

## The Actual Migration Path

### Key Insight: The Factory Already Supports This

```javascript
// Factory config for show_castlist2 would be:
ButtonHandlerFactory.create({
  id: 'show_castlist2',
  deferred: true,           // Sends DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  updateMessage: false,      // POST follow-up (not PATCH @original)
  ephemeral: false,          // Public message
  handler: async (context) => {
    // All the castlist logic
    return { components: [container] };
  }
})
```

This is exactly what the factory does at line 4314-4317:
```javascript
if (config.updateMessage === false) {
  return createFollowupMessage(context.token, webhookData);
}
```

### But There Are Complications

#### 1. show_castlist2 — The Display Engine

**Current**: 133 lines inline in app.js
**What it does**:
- Parses castlist ID from custom_id (handles `_edit` suffix)
- Decodes virtual castlist IDs
- Sends deferred response
- Loads tribes via unified data access
- Checks channel permissions (can bot post here?)
- Builds display via sendCastlist2Response()
- Error recovery via webhook PATCH

**Migration plan**: Extract the logic into a module function, wrap with factory.

```javascript
// NEW: castlistDisplay.js
export async function displayCastlist(context, castlistId, displayMode) {
  const { guildId, userId, member, client, token } = context;
  const channelId = context.channelId;

  // Unified data access
  const { getTribesForCastlist } = await import('./castlistDataAccess.js');
  const allTribes = await getTribesForCastlist(guildId, castlistId, client);

  if (allTribes.length === 0) {
    return { components: [buildNoTribesContainer()] };
  }

  // ... rest of display logic ...
  return responseData;
}
```

```javascript
// app.js — 10 lines instead of 133
} else if (custom_id.startsWith('show_castlist2')) {
  const displayMode = custom_id.endsWith('_edit') ? 'edit' : 'view';
  const castlistId = /* parse from custom_id */;

  return ButtonHandlerFactory.create({
    id: 'show_castlist2',
    deferred: true,
    updateMessage: false,
    handler: async (context) => {
      const { displayCastlist } = await import('./castlistDisplay.js');
      return displayCastlist(context, castlistId, displayMode);
    }
  })(req, res, client);
}
```

**Risk**: LOW — logic doesn't change, just moves.
**Testing**: Display default castlist, display custom castlist, display in edit mode, display with no tribes.

#### 2. castlist2_nav_ — Navigation

**Current**: 141 lines inline in app.js
**What it does**:
- Complex position-based parsing of custom_id
- Sends DEFERRED_UPDATE_MESSAGE (edits existing message)
- Handles disabled buttons
- Validates tribe index bounds
- Sends updated castlist via webhook PATCH

**Migration plan**: This one uses `DEFERRED_UPDATE_MESSAGE` + PATCH, which IS the factory's default deferred pattern.

```javascript
// app.js — 15 lines instead of 141
} else if (custom_id.startsWith('castlist2_nav_')) {
  const navContext = parseCastlistNavigation(custom_id);
  if (navContext.action.startsWith('disabled_')) {
    return res.send({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });
  }

  return ButtonHandlerFactory.create({
    id: 'castlist2_nav',
    deferred: true,
    updateMessage: true,  // PATCH @original
    handler: async (context) => {
      const { handleCastlistNavigation } = await import('./castlistDisplay.js');
      return handleCastlistNavigation(context, navContext);
    }
  })(req, res, client);
}
```

**Risk**: MODERATE — the parsing is tricky and navigation state must be preserved exactly.
**Testing**: Next tribe, prev tribe, next page, prev page, boundary conditions, deleted tribes.

#### 3. castlist2_tribe_prev/next_ — Old Tribe Navigation

**Current**: 160+ lines inline in app.js
**What it does**: Similar to castlist2_nav_ but uses discord.js builders.

**Migration plan**: This appears to be an older version of tribe navigation. Check if `castlist2_nav_` handles the same cases. If so, this might be dead code that can be removed rather than migrated.

**Risk**: Needs investigation — could be dead code.
**Testing**: Find a button that generates this custom_id pattern. If none exist, it's dead code.

## The Extraction Module: castlistDisplay.js

### What Goes In

| Function | Source | Lines | Purpose |
|---|---|---|---|
| `displayCastlist()` | app.js show_castlist2 | ~80 | Main display engine |
| `handleCastlistNavigation()` | app.js castlist2_nav | ~90 | Navigation handler |
| `parseCastlistNavigation()` | app.js castlist2_nav | ~30 | Position-based parsing |
| `buildNoTribesContainer()` | app.js (already shared) | ~15 | No tribes UI |

### What Stays in app.js

- Factory routing stubs (10-15 lines each)
- Custom_id pattern matching
- displayMode extraction

## Phased Migration (Minimise Anxiety)

### Phase 0: Preparation (No Risk)
1. Create `castlistDisplay.js` with just the shared `buildNoTribesContainer()` (already exists as function, just needs exporting)
2. Extract `parseCastlistNavigation()` as a pure function
3. Write tests for the parsing function (verify against known good custom_ids from logs)
4. **Test**: Run existing tests, verify nothing changed

### Phase 1: Navigation First (Lower Risk)
1. Extract `handleCastlistNavigation()` into `castlistDisplay.js`
2. Wrap `castlist2_nav_` with factory in app.js
3. **Test**: Click next/prev tribe, next/prev page on an active castlist with 2+ tribes

**Why navigation first**:
- Uses `DEFERRED_UPDATE_MESSAGE` + PATCH — the factory's default deferred pattern
- If it breaks, user just sees a stale castlist (no data loss)
- Easy to revert (one handler)

### Phase 2: Main Display (Higher Risk, Higher Value)
1. Extract `displayCastlist()` into `castlistDisplay.js`
2. Wrap `show_castlist2` with factory in app.js
3. **Test**: Display castlist from /menu button, display from /castlist command, display in edit mode, display with no tribes, display with deleted roles

**Why second**:
- Uses `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE` + follow-up — needs `updateMessage: false`
- This is THE most visible handler (every castlist view)
- But Phase 1 already proved the extraction pattern works

### Phase 3: Dead Code Audit
1. Investigate `castlist2_tribe_prev/next_` — is anything still generating these custom_ids?
2. If dead: remove
3. If alive: migrate same as Phase 1

### Phase 4: Victory Lap
1. Update `dynamicPatterns` array for button debug system
2. `[🪨 LEGACY]` → `[✨ FACTORY]` for all castlist handlers
3. Celebrate briefly then move on (per Moai protocol)

## Net Impact

| Metric | Before | After |
|---|---|---|
| app.js lines | ~434 castlist handlers | ~30 routing stubs |
| Legacy handlers | 3 | 0 |
| New module | — | castlistDisplay.js (~200 lines) |
| `[🪨 LEGACY]` on castlist | Every. Single. Time. | Never again |
| Test coverage | 0 castlist handler tests | Navigation parsing tests |

## What Could Go Wrong

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Deferred response timing | Low | High | Factory already handles this; tested on 12+ deferred handlers |
| Navigation state loss | Low | Medium | Pure function extraction = same logic, testable |
| Permission check regression | Low | Medium | Extract permission logic unchanged |
| Edit mode broken | Low | High | Phase 2 testing covers this explicitly |
| Placement editing broken | Very Low | High | Placements use separate handlers (already factory) |
| Virtual castlist decoding | Very Low | Low | Virtual adapter is called identically |

## Decision Points

**Option A: Full Migration (Phases 0-4)**
- Removes 400+ lines from app.js
- Eliminates `[🪨 LEGACY]` on the most-used feature
- Creates reusable castlistDisplay module
- Estimated: 2-3 sessions

**Option B: Phase 0-1 Only (Navigation)**
- Lower risk, lower reward
- Proves the pattern works
- Park Phase 2 for later
- Estimated: 1 session

**Option C: Document and Park**
- These handlers work fine as-is
- The `[🪨 LEGACY]` is cosmetic
- Focus energy on user-facing features
- Estimated: 0 sessions (this RaP is the documentation)

## Recommendation

**Option A**, but don't rush it. The factory already supports every pattern these handlers use — they're legacy by inertia, not by necessity. The biggest value isn't the line reduction, it's that every future agent will see `[✨ FACTORY]` on castlist handlers and follow the right pattern instead of copy-pasting 133 lines of inline boilerplate.

Phase 1 first. If it works clean, Phase 2 same session. If it wobbles, park and investigate.

---

*The chef showed up before the kitchen was built. The kitchen's been ready for months. Time to let the chef use it.*

Related: [CastlistArchitecture.md](../03-features/CastlistArchitecture.md), [Placements.md](../03-features/Placements.md), [ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md)
