# RaP 0933: ComponentInteractionFactory (CIF) — Evolution of ButtonHandlerFactory

**Date**: 2026-03-23
**Status**: Implementation Plan Ready
**Risk**: LOW for trivials, MEDIUM for modal support
**Trigger**: Recognition that ButtonHandlerFactory isn't just a button handler — it's CastBot's standardised implementation of the Discord Interactions API

## Original Context

> "Is it really just a buttonHandlerFactory? What about string select options which can have their own handlers? Is factory really not just our standardised implementation of the discord interactions API + Components V2 framework?"

Yes. The factory handles buttons, string selects, role selects, channel selects, user selects — every MESSAGE_COMPONENT interaction type. Calling it "ButtonHandlerFactory" is like calling Express a "GET request handler." The name misleads every agent that reads it.

The factory also implements every Discord interaction response pattern documented in `docs/learning/DiscordPatternLogging.md` — but the doc describes patterns nobody implemented the logging for, and the factory implements patterns nobody documented. They need to be connected.

## What CIF Actually Is

CIF (ComponentInteractionFactory, née ButtonHandlerFactory) is CastBot's **standardised implementation layer** for the Discord Interactions API. It sits between the raw HTTP interaction from Discord and the handler business logic:

```
Discord → Express → app.js routing → CIF → Handler logic → CIF → Discord webhook
```

It implements these Discord interaction patterns:

| Pattern | CIF Config | What CIF Does For You |
|---|---|---|
| ⚡ IMMEDIATE-NEW | Default | Sends type 4, adds IS_COMPONENTS_V2 flag |
| ⚡ IMMEDIATE-UPDATE | `updateMessage: true` | Sends type 7, strips flags (Discord requirement) |
| 🔄 DEFERRED-NEW | `deferred: true` | Sends type 5 immediately, PATCHes @original with result |
| 🔄 DEFERRED-UPDATE | `deferred: true, updateMessage: true` | Sends type 6 immediately, PATCHes @original |
| 🔗 WEBHOOK-POST | `deferred: true, updateMessage: false` | Sends type 5, POSTs follow-up instead of PATCH |
| 📝 MODAL | Return `{ type: 9 }` from handler | **Currently broken** — see Modal Gap below |
| 🔒 EPHEMERAL | `ephemeral: true` | Adds EPHEMERAL flag (fixed this session for non-deferred) |

Plus 6 things no interaction pattern doc covers:
- Auto context extraction (guildId, userId, member, client, token, channelId)
- Permission checking (`requiresPermission: PermissionFlagsBits.X`)
- Error catching with Components V2 error display
- Auto IS_COMPONENTS_V2 flag for Container responses
- Auto-registration in BUTTON_REGISTRY
- `[✨ FACTORY]` / `[🪨 LEGACY]` debug tagging

## The Four Gaps

### Gap 1: Modals Are Second-Class (Small Fix, Biggest Impact)

**Current state**: When a handler needs to show a modal AND the factory config has `updateMessage: true`, the factory commits to UPDATE_MESSAGE before the handler runs. If the handler returns a modal, Discord rejects it.

**Current workaround**: Handle the modal BEFORE the factory with raw `res.send()`. Every agent gets this wrong at least once. The pre-commit hook sees it as legacy. The Moai blocks it. The agent then has to learn a pattern that shouldn't exist.

**The fix**: ~5 lines. Check if the handler returned `type: 9` BEFORE applying the response type:

```javascript
// In the factory's response logic (line ~4290):
// BEFORE: checks config.updateMessage, then sends
// AFTER: checks result.type first

const isModal = result?.type === InteractionResponseType.MODAL;
if (isModal) {
  // Handler wants a modal — send it directly, ignore updateMessage config
  return res.send(result);
}
// ... existing updateMessage / immediate logic
```

This already partially exists (line 4290 checks `isModal`) but only for the non-deferred path. Extend to cover deferred path too.

**See**: `temp/CIF-Modal-Diagrams.md` for visual explanation.

### Gap 2: Modal SUBMIT Handlers Not In Factory (Small Build + Medium Migration)

**Current state**: All ~20 modal submit handlers live in the MODAL_SUBMIT section of app.js using raw `res.send()`. The pre-commit hook explicitly exempts this section. They're "legitimately legacy" — but only because the factory never supported them.

**The fix (Small — build support)**: Add `interactionType: 'MODAL_SUBMIT'` support to CIF. Modal submits come through as interaction type 5, not type 3. The factory currently only handles type 3 (MESSAGE_COMPONENT). Extending it to type 5 is straightforward — same context extraction, same error handling, same response patterns.

**The migration (Medium — gradual)**: Once factory supports modal submits, migrate handlers one-by-one as they're touched. New modals use factory from day one. Pre-commit hook gets a new check: "new modal submit handler outside factory = warning."

### Gap 3: Pattern Log Tags Not Emitted (Trivial)

`docs/learning/DiscordPatternLogging.md` describes tags like `[🔄 DEFERRED-NEW]`, `[⚡ IMMEDIATE-UPDATE]`, `[🔗 WEBHOOK-PATCH]`. These exist in exactly 4 log lines in the `/menu` handler. The factory implements every pattern but doesn't announce which one it's using.

**The fix**: One function in the factory that builds the tag string, called from the 4 response paths (sendResponse, sendDeferredResponse, updateDeferredResponse, createFollowupMessage). ~20 lines total.

### Gap 4: Response Type Redirect (Select → Different Response Per Option)

**Current state**: A String Select handler configured with `updateMessage: true` commits to UPDATE_MESSAGE for ALL options. But some select options need a completely different response type — e.g., a "Post" option that needs DEFERRED-NEW PUBLIC (creates a new non-ephemeral message) while "Edit" and "Delete" options need UPDATE_MESSAGE.

**Real-world example**: Castlist select with options like Edit (update), Delete (update), Post to Channel (deferred new public). The handler detects the selected value and needs to route to a different response type, but the factory already committed to UPDATE_MESSAGE in the ACK.

**Current workaround**: Handle the routing BEFORE the factory — check `req.body.data.values[0]` and branch to different factory calls with different configs. This works but means the select handler is split across multiple `if` blocks before the factory, which looks like legacy code.

**The fix**: Same mechanism as Gap 1 (modal auto-detect). The handler returns a result with a `_responseType` override that the factory respects:

```javascript
// Handler returns override hint:
handler: async (context) => {
  if (context.values[0] === 'post') {
    const result = await buildCastlistPost(...);
    return { ...result, _responseType: 'DEFERRED_NEW_PUBLIC' };
  }
  // Default: UPDATE_MESSAGE (from factory config)
  return buildEditUI(...);
}

// Factory checks before sending:
if (result?._responseType === 'DEFERRED_NEW_PUBLIC') {
  // Switch to deferred new message path
  delete result._responseType;
  // ... send as new public message
}
```

**Complexity**: Medium — the factory needs to handle switching from an already-sent UPDATE ACK to a new message. If the factory already sent `type: 6` (DEFERRED_UPDATE_MESSAGE), it can't switch to `type: 5` (DEFERRED_CHANNEL_MESSAGE). The handler needs to know the response type BEFORE the ACK.

**Alternative**: The factory could accept `responseTypeResolver: (values) => 'DEFERRED_NEW'` in config — a function that runs BEFORE the ACK to determine response type based on the interaction data. This is cleaner but more complex.

**Depends on**: Gap 1 (modal auto-detect) — same mechanism, same code path.

## Implementation Plan

### Phase 1: Trivials (One Commit)

All trivials from the table below. One commit, no testing needed, instant improvement.

| Change | Lines | Risk |
|---|---|---|
| Pattern log tags from factory response paths | ~20 | None — log-only |
| `followUp: true` alias for `updateMessage: false` | 2 | None — alias |
| Pre-commit hook: `updateDeferredResponse` wrong arg count | 3 | None — warning only |
| Naming alias: `export { ButtonHandlerFactory as ComponentInteractionFactory }` | 1 | None — alias |
| Update CLAUDE.md to say "ComponentInteractionFactory (CIF)" | 5 | None — docs |
| Cross-reference: DiscordPatternLogging.md → "use CIF" | 10 | None — docs |

**Estimated**: 30 minutes. **Test**: `dev-restart.sh`, click any button, verify tags appear in logs.

### Phase 2: Modal Auto-Detect + Response Type Redirect (Small-Medium)

The ~5 line fix that makes modals a first-class response type, PLUS the response type redirect for select handlers that need different response types per option (Gap 4).

**Implementation**:
1. In factory's non-deferred response path (line ~4288): move the `isModal` check BEFORE the `shouldUpdateMessage` logic
2. In factory's deferred response path (line ~4297): add the same `isModal` check — if handler returned a modal from a deferred handler, log a warning (modals can't be deferred)
3. Remove `requiresModal: true` from BUTTON_REGISTRY entries — no longer needed since factory handles it
4. Add `responseTypeResolver: (context) => 'DEFERRED_NEW'` config option — runs BEFORE the ACK to determine response type based on interaction values
5. Or simpler: add `_responseType` result override detection (same pattern as modal auto-detect)
4. Update `ButtonHandlerFactory.md` modal section — remove "Cannot Use Factory" language

**Test**: Find a select menu with a modal option (question_completion_select → edit). Remove the handle-before-factory workaround. Verify modal shows via factory.

**Estimated**: 1 hour including testing.

### Phase 3: Modal SUBMIT Support (Small Build)

Build factory support for modal submit interaction type.

**Implementation**:
1. In app.js MODAL_SUBMIT routing section: add a parallel routing mechanism that calls `ComponentInteractionFactory.create()` for new-style modal handlers
2. Add `interactionType` property to CIF config (default: 'MESSAGE_COMPONENT')
3. Context extraction for modal submits: extract `components` (form values), `custom_id`, same guild/user/member/token as buttons
4. Response handling: modal submits typically use `UPDATE_MESSAGE` (update the message that had the button) or `CHANNEL_MESSAGE_WITH_SOURCE`

**Do NOT migrate existing handlers**. Just make the pattern available. Test with ONE new modal handler.

**Estimated**: 2 hours. **Test**: Create or find a simple modal submit handler, convert it, verify it works.

### Phase 4: Modal SUBMIT Migration (Medium, Gradual)

Migrate existing modal submit handlers as they're touched. Not all at once.

**Priority order**:
1. New modal handlers — factory from day one
2. Handlers that are being modified for other reasons — migrate while touching
3. Simple handlers (save + update message) — low risk migration
4. Complex handlers (multi-step, webhook chains) — last, most care needed

**Pre-commit hook**: Add warning (not block) for new modal submit handlers using raw `res.send()` when the factory supports them.

**Estimated**: Ongoing, 2-3 sessions over time.

### Phase 5: Documentation Rewrite (After Implementation)

Rewrite `ButtonHandlerFactory.md` to reflect reality:
- Rename to `ComponentInteractionFactory.md`
- Remove aspirational content (Menu Factory patterns that don't exist)
- Add pattern mapping table (Discord pattern → CIF config)
- Add modal examples (first-class, not workaround)
- Remove "Cannot Use Factory" modal section
- Cross-reference `DiscordPatternLogging.md`

**Do this LAST**. Documentation before implementation = aspirational docs. The codebase is the truth.

## Pre-Commit Hook Additions

### Hook 1: `updateDeferredResponse` Wrong Arg Count (Phase 1)

```bash
# Check for 3-arg updateDeferredResponse calls (common agent mistake)
WRONG_ARGS=$(git diff --cached -- '*.js' | grep '^+' | grep -v '^+++' | \
  grep -c 'updateDeferredResponse(req\.body\|updateDeferredResponse(.*,.*,.*)') || WRONG_ARGS=0

if [ "$WRONG_ARGS" -gt 0 ]; then
  echo "🗿 THE MOAI NOTICES..."
  echo "  updateDeferredResponse takes 2 args (token, data), not 3."
  echo "  The app ID comes from process.env.APP_ID automatically."
  echo "  (This is a warning — commit is not blocked for this.)"
fi
```

### Hook 2: New Modal Submit Outside Factory (Phase 4, after support exists)

Warning only. Same pattern as the legacy button check but for the MODAL_SUBMIT section.

## What The Future Stone Needs To Know

1. **The table IS the plan.** Each row is a task. Effort column IS the priority guide.
2. **The trivials are ONE commit.** Pattern log tags + alias + docs. Don't split them.
3. **Modal auto-detect is the unlock.** Without it, modal submit factory support is building on a broken foundation.
4. **The rename is an alias, not a rename.** `export { ButtonHandlerFactory as ComponentInteractionFactory }`. Old code keeps working. CLAUDE.md says "ComponentInteractionFactory (CIF)." Rename the file later when legacy count is low.
5. **`ButtonHandlerFactory.md` is 1192 lines of aspirational documentation.** Rewrite it AFTER the implementation, not before. Don't update docs for code that doesn't exist yet. The codebase is the truth. Documentation is aspiration.
6. **The pre-commit hook for `updateDeferredResponse` arg count goes in Phase 1.** It's 3 lines of shell. That exact bug has caused prod issues twice.
7. **`DiscordPatternLogging.md` becomes the THEORY reference, CIF becomes the IMPLEMENTATION reference.** They cross-reference each other. The doc says "use CIF." The factory announces which pattern it's using via log tags.
8. **Don't migrate all modal submits at once.** Chip away. New modals use factory. Old ones migrate as touched. The pre-commit hook warns but doesn't block.

## The Cautionary Tale

An agent was building custom reaction panels. It called `updateDeferredResponse(req.body.application_id, token, data)` — 3 args instead of 2. The application_id was treated as the token. Every modal submission silently failed with "webhook interaction expired." The fix was removing one argument. The pattern doc described the correct flow. The agent read the doc. The agent still got it wrong. Because documentation is aspiration. Structure is enforcement.

The factory prevents this class of bug entirely. The handler returns data. The factory sends it. You can't get the signature wrong because you never call it.

## Implementation Summary

| Phase | What | Effort | Risk | Blast Radius | Status |
|---|---|---|---|---|---|
| **1: Trivials** | Log tags, alias, docs | 30 min | None | Log-only, no behavior change | **Done** ✅ |
| **2a: Modal auto-detect** | Factory checks `type: 9` before committing response type | 1 hr | Low | Only affects handlers that return modals — existing `requiresModal` handlers keep working | **Done** ✅ |
| **2b: Response type redirect** | `responseTypeResolver` or `_responseType` override | 2 hr | Medium | Touches factory response path — all 400+ factory handlers flow through this. One wrong condition = all buttons break | Not started |
| **3: Modal SUBMIT support** | Factory handles interaction type 5 | 2 hr | Low | New code path, doesn't touch existing modal handlers | Not started |
| **4: Modal SUBMIT migration** | Migrate existing handlers to factory | Ongoing | Medium per handler | Each migration changes how a modal responds — test individually | Not started |
| **5: Doc rewrite** | Rename to CIF, rewrite ButtonHandlerFactory.md | 1 hr | None | Docs only | Not started |

**Highest value**: Phase 2a (modal auto-detect) — eliminates the most common agent confusion and pre-commit hook friction.

**Highest risk**: Phase 2b (response type redirect) — the factory response path is the single hottest code path in the app. Every button click, select, and component interaction flows through it. Getting the redirect logic wrong breaks everything.

**Recommended order**: 1 → 2a → 3 → 5 → 2b → 4. Do the response type redirect AFTER modal support is solid and tested, not before.

## Net Impact

| Metric | Before | After |
|---|---|---|
| Interaction patterns with log tags | 1 (menu only) | All |
| Modal handling | Handle-before-factory workaround | First-class auto-detect |
| Response type switching | Split handler across multiple factory calls | Handler returns override hint |
| Modal submit handlers in factory | 0 of ~20 | New ones + gradual migration |
| Name accuracy | "ButtonHandlerFactory" (misleading) | "ComponentInteractionFactory" (accurate) |
| Pre-commit coverage | Legacy buttons only | + wrong arg count, + modal submits |
| Agent confusion rate | High (modals, response types) | Low (one pattern for everything) |

## Related

- [RaP 0935: Castlist Factory Migration](0935_20260321_CastlistFactoryMigration_Analysis.md) — Phase 1+2 completed this session
- [ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md) — current docs (needs rewrite after implementation)
- [DiscordPatternLogging.md](../learning/DiscordPatternLogging.md) — pattern theory reference
- [temp/CIF-Modal-Diagrams.md](../../temp/CIF-Modal-Diagrams.md) — visual explanation of modal gap

---

*The factory was named for what it did first, not what it became. It handles buttons, selects, modals, webhooks, permissions, errors, and logging. It's the kitchen. Time to put the right sign on the door.* 🗿
