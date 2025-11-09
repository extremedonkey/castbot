# CastlistV3 Pre-Launch Tweaks Documentation

## Original Requirements (Full Prompt)

**User Request**: Various changes - castlist_hub_main, tribes @docs/implementation/TribeManager.md @docs/features/TribeSwapMerge.md - please ensure you review guidelines in @CLAUDE.md @docs/standards/ComponentsV2.md @docs/standards/DiscordInteractionAPI.md and avoid @docs/troubleshooting/ComponentsV2Issues.md common issues.

**Context**: Comparing legacy tribe creation vs new castlist architecture, focusing on achieving data parity and UI/UX improvements.

### Log Summary
- Legacy tribe creation adds fields: `emoji`, `castlist`, `showPlayerEmojis`, `color`, `analyticsName`, `analyticsAdded`
- New castlist creation adds minimal tribe data: `castlistIds`, `castlist` name only
- Need to populate missing fields for feature parity

## Key Files and Functions

### Primary Files to Modify
1. **app.js** (lines 18300-18500, 28665-28900)
   - `prod_add_tribe_modal_*` handler
   - `castlist_tribe_select_*` handler
   - `tribe_edit_button|*` handler (needs ButtonHandlerFactory conversion)
   - `castlist_edit_info_*` modal handler
   - `castlist_swap_merge` modal handler

2. **castlistHandlers.js** (lines 572-674, 1001-1150)
   - `handleCastlistTribeSelect()` - Main tribe addition logic
   - `handleTribeEditModal()` - Tribe editing

3. **castlistHub.js** (lines 436-520)
   - `createCastlistHub()` - Hub UI generation
   - Tribe sections generation
   - Button layout

4. **buttonHandlerFactory.js**
   - Need to register `tribe_edit_button` pattern

### Key Functions to Review
- `getDiscordRoleColor()` - Extract role color from Discord API
- `formatHexColor()` - Format color to #123456 format
- `getTribesForCastlist()` - Fetch tribes with member data
- `updateTribeData()` - Update tribe properties

## Design Options

### Option 1: Comprehensive Refactor (Recommended)
**Approach**: Create centralized tribe management service that handles all tribe data operations

**Pros**:
- Single source of truth for tribe data
- Consistent data structure across legacy and new systems
- Easier maintenance and debugging
- Clean separation of concerns

**Cons**:
- Larger initial implementation effort
- Need to test all existing tribe operations

**Implementation**:
1. Create `tribeDataService.js` module
2. Centralize all tribe property management
3. Update handlers to use service methods
4. Ensure backwards compatibility

### Option 2: Incremental Updates
**Approach**: Update each handler individually to add missing fields

**Pros**:
- Lower risk, can test incrementally
- Faster initial implementation
- No major architectural changes

**Cons**:
- Code duplication across handlers
- Harder to maintain consistency
- Technical debt accumulation

**Implementation**:
1. Update `handleCastlistTribeSelect()` to set all fields
2. Modify modal handlers individually
3. Add validation in each location

### Option 3: Hybrid Approach
**Approach**: Add utility functions for common operations, update handlers to use them

**Pros**:
- Balance between refactoring and speed
- Reusable code without full service layer
- Can migrate to full service later

**Cons**:
- Still some duplication
- Not as clean as full service

## Detailed Changes

### 1. Tribe Data Population
When creating/editing tribes via `castlist_tribe_select_*`:

```javascript
// Fetch Discord role data
const role = await guild.roles.fetch(roleId);

// Set tribe properties
tribeData = {
  castlistIds: [castlistId],
  castlist: castlistName,
  color: formatRoleColor(role.color), // Format: #123456
  analyticsName: role.name,
  analyticsAdded: Date.now(),
  emoji: tribeData.emoji || '🏕️', // Default emoji
  showPlayerEmojis: tribeData.showPlayerEmojis ?? true
};
```

### 2. Castlist Modal UI Changes

#### Sort Strategy Repositioning
- Move below "Castlist Name" field
- Rename to "Castlist Sorting Method"
- Update options:
  1. "Placements" (default)
  2. "Alphabetical (A-Z), no placements"
  3. "Placements, then Alphabetical (A-Z)"
- Remove: Age, Timezone, Join Date

#### Default Castlist Editing
- Enable Edit button for default castlist
- Hide name/emoji/description fields when editing default
- Allow season association

### 3. Hub UI Updates

#### Information Display
```markdown
### 🏕️ Tribes on Castlist
* Tribes sorted by <SortingStrategyName>
* Castlist is associated with <SeasonName / No Season>
```

#### Tribe Sections
- Show player count and names (max 38 chars)
- Format: "5 players: Alice, Bob, Charlie.."
- Move tribe selector below info text

#### Button Layout Changes
- Move Swap/Merge next to Placements button
- Add validation for default castlist requirement

### 4. Swap/Merge Modal Updates
- Update all labels and descriptions
- Remove 2+ tribe requirement
- Clarify experimental features

### 5. Edit Tribe Modal
- Remove Analytics Name field (auto-populated)
- Remove Display Name field
- Fix color validation for hex without #

### 6. ButtonHandlerFactory Conversion

Convert `tribe_edit_button|*` to factory pattern:

```javascript
// In buttonHandlerFactory.js
'tribe_edit_button_*': {
  label: 'Edit Tribe',
  description: 'Edit tribe settings',
  emoji: '✏️',
  style: 'Secondary',
  category: 'castlist'
}

// In app.js
} else if (custom_id.startsWith('tribe_edit_button|')) {
  return ButtonHandlerFactory.create({
    id: 'tribe_edit_button',
    updateMessage: false,
    handler: async (context) => {
      const [, roleId, castlistId] = context.customId.split('|');
      // Modal generation logic
    }
  })(req, res, client);
}
```

## Test Checklist

### Data Validation Tests
- [ ] New tribe has all required fields (color, analyticsName, emoji, etc.)
- [ ] Color format is consistent (#123456)
- [ ] Analytics name updates when Discord role name changes
- [ ] Default emoji (🏕️) is set correctly

### UI/UX Tests
- [ ] Sort strategy in modal works correctly
- [ ] Placements is default sort option
- [ ] Info text shows correct sort method and season
- [ ] Player names display correctly in tribe sections (max 38 chars)
- [ ] Swap/Merge button validation for default castlist

### Modal Tests
- [ ] Create new castlist modal has sort strategy
- [ ] Edit default castlist hides appropriate fields
- [ ] Swap/Merge modal text updates are correct
- [ ] Tribe edit modal no longer has Analytics Name field

### Integration Tests
- [ ] Legacy tribes still work correctly
- [ ] New castlist tribes have full data
- [ ] ButtonHandlerFactory conversion works
- [ ] No duplicate data or conflicts

## Implementation Summary

**Recommended Approach**: Option 3 (Hybrid) - Add utility functions for common operations while updating handlers incrementally.

**Priority Order**:
1. Add tribe data population utilities
2. Update `castlist_tribe_select_*` handler
3. Modify castlist create/edit modals
4. Update hub UI layout
5. Convert `tribe_edit_button` to factory pattern
6. Update Swap/Merge modal text
7. Clean up deprecated code

**Risk Assessment**: Low-Medium
- Main risk is data inconsistency during transition
- Mitigated by backwards compatibility checks
- Thorough testing of both legacy and new paths

## Notes
- Ensure all changes follow Components V2 standards
- Use proper UPDATE_MESSAGE patterns
- Validate component limits (40 max)
- Test with both legacy and new castlists

## Original Prompt (for context only - use above as source of truth)
See [castlistV3PreLaunchTweaks_originalPrompt.md](./castlistV3PreLaunchTweaks_originalPrompt.md)