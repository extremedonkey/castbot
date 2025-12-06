# RaP 0964: Map Drops vs Custom Actions - Tech Debt Analysis

**Date**: 2025-12-06
**Triggered By**: Investigation of duplicate "button style" selectors in Safari admin UI
**Status**: Options Analysis

## Original Context

> "I looked into the button colors more - so level 1 where I believe the color is actually driven from appears to be set from the 'Trigger Type' button (entity_action_trigger_*) -> this is the desired menu location and behaviour, all good!
>
> However, other places which appear to have 'set button color' UIs (these came from our original hero prompt many moons ago but were never implemented), include:
> 1. Give_Currency - need to check this isn't re-used in the Manage Drops > Currency Drop
> 2. Give Item - as above need to check this doesn't clash with the Drops feature UI / code"

## Discovery Summary

### Two Parallel Systems Exist

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SAFARI RESOURCE DISTRIBUTION                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────┐   ┌─────────────────────────────┐  │
│  │      MAP DROPS (Legacy)     │   │   CUSTOM ACTIONS (Modern)   │  │
│  ├─────────────────────────────┤   ├─────────────────────────────┤  │
│  │ Entry: Manage Drops button  │   │ Entry: Custom Actions menu  │  │
│  │ Data: coordData.itemDrops[] │   │ Data: buttons.actions[]     │  │
│  │       coordData.currDrops[] │   │       (give_item, etc.)     │  │
│  │                             │   │                              │  │
│  │ Button per drop: YES        │   │ Button per drop: NO          │  │
│  │ (buttonStyle valid here)    │   │ (one trigger button)         │  │
│  │                             │   │                              │  │
│  │ Features:                   │   │ Features:                    │  │
│  │ - Quick item/currency drops │   │ - Multi-step workflows       │  │
│  │ - Per-drop button style     │   │ - Conditions & branches      │  │
│  │ - Once/unlimited limits     │   │ - Text displays              │  │
│  │ - Reset claims              │   │ - Role grants/revokes        │  │
│  │                             │   │ - Calculate Results          │  │
│  │ Handlers:                   │   │ - Follow-up actions          │  │
│  │ - map_add_item_drop_*       │   │ - Import/Export              │  │
│  │ - map_item_drop_select_*    │   │                              │  │
│  │ - map_drop_style_*          │   │ Handlers:                    │  │
│  │ - map_drop_save_*           │   │ - safari_action_type_select_ │  │
│  │ - map_currency_drop_*       │   │ - safari_give_item_select_*  │  │
│  │                             │   │ - safari_currency_*          │  │
│  └─────────────────────────────┘   │ - custom_action_button_style_│  │
│                                    └─────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### The Bug We Fixed (December 2025)

Custom Actions had button style selectors in `give_item` and `give_currency` sub-action configuration UIs. These were:
1. **Conceptually wrong**: Sub-actions don't create their own buttons
2. **Actually harmful**: Saved to `button.style`, overwriting the parent trigger button's style
3. **Dead code from hero prompt**: Implemented but never properly connected

**Fixed by removing**:
- `safari_item_style_*` handler
- `safari_currency_style_*` handler
- Button Style Select dropdowns from `showGiveItemConfig()` and `showGiveCurrencyConfig()`
- Style save logic in `safari_item_save` and `safari_currency_save`

---

## Options Analysis

### Option A: Keep Both Systems (Status Quo)

**Description**: Leave Map Drops and Custom Actions as parallel systems.

**Pros**:
- Map Drops is simpler/faster for single-item/currency distribution
- No migration effort required
- Existing drops continue working

**Cons**:
- Two systems to maintain (code duplication)
- Confusion for admins ("which do I use?")
- Different data structures complicate import/export
- Documentation overhead

**Effort**: 0 hours
**Risk**: LOW (nothing changes)

---

### Option B: Deprecate Map Drops (Recommended)

**Description**: Stop developing Map Drops. Keep functional but add "Use Custom Actions instead" nudges. Eventually migrate existing drops.

**Phase 1: Soft Deprecation (1-2 hours)**
- Add info banner to Map Drops UI: "Consider using Custom Actions for more features"
- Update documentation to recommend Custom Actions
- No code removal

**Phase 2: Migration Tooling (4-6 hours)**
- Create "Convert to Custom Action" button in Map Drops config
- Auto-converts drop to equivalent give_item/give_currency Custom Action
- Preserves existing claims data

**Phase 3: Hard Deprecation (2-4 hours, future)**
- Remove "Manage Drops" from location manager
- Run auto-migration for any remaining drops
- Remove drop-specific handlers

**Pros**:
- One unified system going forward
- Custom Actions already has more features
- Simplifies codebase long-term
- Import/Export works with everything

**Cons**:
- User re-training (minor - Custom Actions is similar UX)
- Migration effort required
- Slight complexity increase for simple use cases

**Effort**: 7-12 hours total (phased)
**Risk**: MEDIUM (migration could miss edge cases)

---

### Option C: Merge Features into Custom Actions

**Description**: Take the "quick add" UX from Map Drops and integrate into Custom Actions.

**Implementation**:
1. Add "Quick Item Drop" and "Quick Currency Drop" as action types
2. These auto-create a minimal Custom Action with just give_item/give_currency
3. Show simplified config (no conditions, no text display)
4. Remove standalone Map Drops feature

**Pros**:
- Best of both worlds
- Single unified data model
- Quick UX for simple cases
- Full power available when needed

**Cons**:
- More development than Option B
- Need to maintain two UX paths within Custom Actions

**Effort**: 8-10 hours
**Risk**: MEDIUM (scope creep potential)

---

### Option D: Full Removal Now

**Description**: Delete Map Drops completely, migrate all existing drops immediately.

**Pros**:
- Clean codebase immediately
- No deprecation period

**Cons**:
- Risky for production (what if migration fails?)
- User disruption
- No gradual transition

**Effort**: 6-8 hours (one-time)
**Risk**: HIGH (production data migration)

---

## Recommendation

### Short Term: Option A (Status Quo)
Keep both systems working. The bug is fixed. Low priority to merge.

### Medium Term: Option B Phase 1 (Soft Deprecation)
Add documentation and UI hints steering toward Custom Actions.

### Long Term: Option B Phases 2-3 (Migration & Removal)
When resources allow, build migration tools and sunset Map Drops.

---

## Code References

| Component | Location | Purpose |
|-----------|----------|---------|
| Map Drops Data | `safariContent[guild].maps[mapId].coordinates[coord].itemDrops[]` | Legacy per-coordinate drops |
| Custom Actions Data | `safariContent[guild].buttons[actionId].actions[]` | Modern action system |
| Map Drops UI | `app.js:25300-26600` | Manage Drops handlers |
| Custom Actions UI | `customActionUI.js` | Custom Action editor |
| Drop Button Rendering | `safariButtonHelper.js:260-280` | Renders drop buttons on anchors |

---

## Related Documents

- [SafariCustomActions.md](../docs/features/SafariCustomActions.md) - Modern action system
- [SafariMapDrops.md](../docs/features/SafariMapDrops.md) - Legacy drops documentation
- [ButtonHandlerRegistry.md](../docs/enablers/ButtonHandlerRegistry.md) - All Safari handlers

---

## Action Items

- [x] Fix button style bug in Custom Actions (this session)
- [ ] Add deprecation banner to Map Drops (future - Option B Phase 1)
- [ ] Create migration button (future - Option B Phase 2)
- [ ] Sunset Map Drops handlers (future - Option B Phase 3)
