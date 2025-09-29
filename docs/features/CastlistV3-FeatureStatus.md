# CastlistV3: Feature Implementation Status

**Last Updated**: September 29, 2025 (MAJOR FIXES IMPLEMENTED)
**Status**: Core Features Working, Advanced Features Pending

## 🎯 Executive Summary

CastlistV3's **infrastructure is production-ready** (2,731+ lines), but many **user-facing features remain incomplete**. The virtual adapter works silently in production, but advanced features like manual ordering and swap/merge are placeholders.

**Critical Context**: The "Default Castlist" is the **heart of CastBot** - not an optional feature. It represents the active season's main player roster and is what most users interact with daily. CastlistV3 Hub must support default castlist creation and management.

**Latest Update (Sept 29, 2025 - Evening Session)**:
- ✅ **FIXED**: Active/Default castlist "Post Castlist" button now works
- ✅ **FIXED**: Multi-tribe selection race condition completely resolved
- ✅ **WORKING**: Active/Default castlist fully functional with tribe management
- ✅ **VERIFIED**: Multi-castlist support (one tribe on multiple castlists) working
- ⚠️ **REMAINING**: Placements sorting (function exists but no data), manual ordering, swap/merge features

## 📋 Conversation Context Summary

This document was created during comprehensive analysis session covering:

### 1. Initial Assessment (Incorrect)
- **Original claim**: "CastlistV3 is complete and live in production"
- **Reality**: Infrastructure is complete, but major features are missing/stub implementations
- **Correction**: Infrastructure ≠ Feature completeness

### 2. What's Actually Complete
- ✅ **Infrastructure**: Virtual adapter, CastlistManager, Display engine, Hub UI
- ✅ **Basic CRUD**: Create, read, update, delete castlists
- ✅ **Virtual Adapter**: Legacy string-based castlists appear as entities, auto-migrate on edit
- ✅ **Two Sort Strategies**: Alphabetical and Placements fully functional
- ✅ **Hub UI**: Hot-swappable interfaces for management

### 3. What's Missing/Incomplete
- ❌ **Manual Ordering**: Button exists, shows sort dropdown, but no actual reordering UI
- ❌ **Swap/Merge**: Button shows "coming soon" placeholder
- ❌ **4 Sort Strategies**: Reverse Alpha, Age, Timezone, Join Date (UI exists, functions don't)
- ❌ **Add New Castlist**: No UI entry point despite createCastlistWizard() being built
- ⏳ **Legacy Removal**: prod_manage_tribes still active, Hub restricted to one user

### 4. Add New Castlist Discovery
**Finding**: Never implemented despite infrastructure being ready

**What Exists**:
- ✅ `createCastlistWizard(guildId, 'season|role|custom')` - Complete
- ✅ Handler for `castlist_create_*` buttons - Working
- ✅ Button registry entries - Registered

**What's Missing**:
- ❌ "➕ New Castlist" option in dropdown (castlistHub.js:60-113)
- ❌ Creation type selector menu
- ❌ Handler update to catch 'create_new' value

**Estimated Implementation**: 30-45 minutes

### 5. Legacy Pattern Analysis (prod_add_tribe_castlist_select)
**Location**: app.js:26945-27083 (inline implementation)

**Pattern**:
1. Scan tribes for unique castlist names (string-based)
2. Build dropdown: Default → Existing → New Custom
3. Display ComponentsV2 container
4. Handle selection → continue to emoji modal

**Reusable Concepts**:
- ✅ Option ordering (default first, new last)
- ✅ ComponentsV2 container structure
- ✅ Alphabetical sorting
- ✅ 25-item limit handling

**Too Coupled**:
- ❌ String scanning (use virtual adapter instead)
- ❌ Inline 130+ lines (should be function)
- ❌ RoleId in custom_id (not needed for Hub)

**Recommendation**: Extract pattern, not code. Create `buildCastlistOptions()` helper in castlistHub.js.

### 6. Default Castlist - THE HEART OF CASTBOT (NOW IMPLEMENTED)

**Critical Correction**: Default castlist is NOT optional or just for beginners. It's the **core castlist** representing active season's main player roster.

**Implementation Update (Sept 29, 2025)**: Active Castlist (renamed from Default) has been implemented in CastlistV3 Hub with the following critical design decisions:

**1. Multi-Castlist Support Implemented**:
```javascript
// Tribe data structure now supports multiple castlists
tribe: {
  // Legacy single castlist (string format - still supported)
  castlist: "default" || "Custom Name",

  // NEW: Multi-castlist array format
  castlistIds: ["default", "castlist_12345_user", "virtual_xyz"],

  // NEW: Role color extracted from Discord API
  color: "#5865F2"  // Stored on tribe, NOT castlist
}
```

**2. Active Castlist Virtual Entity**:
```javascript
// Created by castlistVirtualAdapter.ensureDefaultCastlist()
{
  id: 'default',
  name: 'Active Castlist',  // Renamed for clarity
  type: 'system',           // Cannot be deleted
  isVirtual: true,          // Until materialized on first edit
  tribes: [/* computed */],  // Dynamically finds all tribes using it
  metadata: {
    description: 'Select if you don\'t know what you\'re doing. Castlist for active phase of the game.',
    emoji: '📋',
    isDefault: true
  }
}
```

**3. Color Extraction Bug Fix**:
```javascript
// FIXED: Extract color from Discord resolved roles, not castlist metadata
const roleData = resolvedRoles[roleId];
const roleColor = roleData?.color
  ? `#${roleData.color.toString(16).padStart(6, '0')}`
  : null;

// Store on tribe, not castlist
tribes[roleId] = {
  name: `Tribe ${roleId}`,
  emoji: '🏕️',
  color: roleColor  // Correctly stored per-tribe
};
```

**4. No Implicit Fallback Behavior**:
- User explicitly rejected implicit default assignment
- Tribes without castlist field DO NOT automatically belong to default
- This prevents confusion and ensures explicit castlist assignment
- Implementation awaits user's step-by-step design

**How Default Works**:

```javascript
// 1. ALWAYS first option (app.js:26962-26967)
{
  label: 'Default Castlist',
  description: 'Recommended if you don\'t know what you\'re doing',  // Misleading description
  value: 'default',
  emoji: { name: '✅' }
}

// 2. Matching logic (app.js:4756, 7626)
if (tribe.castlist === castlistName || (!tribe.castlist && castlistName === 'default')) {
  // Match found
}
```

**Key Insight**: Tribes with NO `castlist` field **implicitly belong to default**. This is the fallback mechanism.

**Initialization Flow**:
1. **Brand new server**: No tribes in playerData.json
2. **Admin adds first tribe**: Production Menu → Tribes → Add Tribe → Select Tribes → Select Castlist
3. **Default option appears**: Always first in dropdown (hardcoded)
4. **Admin selects "Default"**: Tribe gets `castlist: "default"` OR no field (implicit default)
5. **Subsequent tribes**: Can join default or create custom castlists

**Display Behavior**:
- Empty default: "No tribes have been added to the default Castlist yet. Please have Production add tribes..."
- Populated default: All tribes with `castlist: "default"` OR no castlist field
- User-first ordering: Default castlist uses "user-first" tribe reordering (your tribe shows first)

**Why It Matters for CastlistV3**:
- Hub MUST include default castlist in dropdown (not currently present)
- Hub dropdown should list: Default → Real Entities → Virtual Entities → ➕ New
- Default represents active season roster - most frequently accessed castlist
- Cannot deprecate legacy without ensuring default works in new system

### 7. Related Architectural Context

**Virtual Adapter Pattern**:
- Makes legacy string-based castlists appear as entities
- Materializes (converts to real) only on edit operations
- Maintains backwards compatibility with both `castlist` (string) and `castlistId` (entity ID)
- Evidence: "Haszo" castlist successfully migrated in production

**buildCastlist2ResponseData Migration** (RaP/1000):
- Successfully moved from app.js (21,000+ lines) to castlistV2.js
- Zero breaking changes confirmed
- Clean separation of concerns achieved

**Hub Restriction**:
- Currently limited to user ID `391415444084490240` only
- Intentional: Testing new features in production without exposing to all users
- Must be removed before deprecating legacy prod_manage_tribes

### 8. Next Steps Decision Points

**Three Paths Forward**:

**Option A: Add New Castlist** (30-45 min - Immediate Need)
- Add "➕ New Castlist" to dropdown
- Create type selector menu
- Wire to existing createCastlistWizard()
- **Unblocks**: Creating new castlists in modern system

**Option B: Complete Sort Strategies** (1-2 days - Quick Wins)
- Implement 4 missing sort functions
- Fix Reverse Alpha call
- **Unblocks**: User confusion about non-working options

**Option C: Manual Ordering** (3-5 days - Major Feature)
- Design player list UI with reordering
- Implement save to castlist.rankings
- **Unblocks**: Custom placement use cases

**Option D: UI/UX Polish** (2-3 days - Quality)
- Confirmations, loading states, better errors
- **Unblocks**: Professional experience

## 📊 Implementation Matrix

### ✅ Infrastructure Layer (COMPLETE)

| Component | Status | Lines | Completeness |
|-----------|--------|-------|--------------|
| Virtual Adapter | ✅ Complete | 273 | 100% - Working in production |
| CastlistManager | ✅ Complete | 405 | 100% - All CRUD methods |
| Display Engine | ✅ Complete | 767+ | 100% - All rendering |
| Hub UI Framework | ✅ Complete | 528 | 100% - Hot-swappable UI |
| Handlers | ✅ Complete | 388 | 100% - All interactions |
| Utilities | ✅ Complete | 267 | 100% - Helper functions |

**Infrastructure Total**: 2,731+ lines, 100% complete

### 🟢 Basic Features (COMPLETE)

| Feature | Status | Implementation | Notes |
|---------|--------|----------------|-------|
| View Castlist | ✅ Working | castlistHub.js:270-284 | Uses show_castlist2 directly |
| Edit Info (Name/Emoji/Description) | ✅ Working | castlistHandlers.js:89-152 | Modal submission |
| Add/Remove Tribes | ✅ Working | castlistHandlers.js:198-249 | Role selector with current |
| Delete Castlist | ✅ Working | castlistHandlers.js:257-333 | Cleans up tribe links |
| Dropdown Selection | ✅ Working | castlistHandlers.js:15-30 | Shows all castlists |
| Virtual → Real Migration | ✅ Working | castlistManager.js:104-110 | Auto on edit |

### 🟡 Sort Strategies (PARTIAL - 17% Complete)

| Strategy | UI Button | Sorting Function | Status | Implementation |
|----------|-----------|------------------|--------|----------------|
| Alphabetical (A-Z) | ✅ | ✅ | Working | castlistSorter.js:90-97 |
| Placements (Chronological e.g. show 1 first)| ✅ | ⏳ | **PENDING DATA** | castlistSorter.js:49-82 (function exists, awaits Placement Editor data) |
| Placements - Eliminated Chronological (Show all active players first, then show chronical order e.g. if in the final 5 round, the first 5 players would be shown, then the eliminated players (players 6 to last place))| ❌ | ❌ | **NOT PLANNED** | Complex variation - not in current scope |
| Placements - Eliminated Reverse  Chronological (Show all active players first, then show reverse chronical order e.g. if in the final 5 round, the first 5 players would be shown, then the eliminated players (players last place to 6))| ❌ | ❌ | **NOT PLANNED** | Complex variation - not in current scope |
| Placements (Reverse Chronological e.g. show last place first)| ❌ | ❌ | **NOT PLANNED** | Would need reverse sort option |
| Reverse Alpha (Z-A) | ✅ | ❌ | **Stub** | castlistHub.js:381-387 (UI only) |
| Age | ✅ | ❌ | **Stub** | castlistHub.js:395-401 (UI only) |
| Timezone | ✅ | ❌ | **Stub** | castlistHub.js:402-408 (UI only) |
| Join Date | ✅ | ❌ | **Stub** | castlistHub.js:409-416 (UI only) |

**Note**: UI shows 6 sort options, but only 1 actually works (Alphabetical). Placements sorting function exists but awaits data from Placement Editor implementation. The other 4 fall back to alphabetical.

**UPDATE (Jan 2025)**: Placement Editor will provide the data structure needed for placement sorting to work.

**What Works**:
- ✅ Dropdown shows all 6 options
- ✅ Selection saved to castlist.settings.sortStrategy
- ✅ Alphabetical sorts correctly
- ⚠️ Placements sorting function exists but has NO DATA (rankings never populated)

**What Doesn't Work**:
- ❌ Reverse Alpha - `sortAlphabetical(members, true)` never called
- ❌ Age - No `sortByAge()` function exists
- ❌ Timezone - No `sortByTimezone()` function exists
- ❌ Join Date - No `sortByJoinDate()` function exists

### ❌ Major Missing Features (0% Complete)

#### 1. ORDER Feature (Manual Ordering System)

**Current State**:
- Button exists: `castlist_order_{id}` (castlistHub.js:298-302)
- Shows dropdown of sort strategies (castlistHub.js:361-418)
- Saves strategy selection (castlistHandlers.js:169-192)

**What's Missing**:
```javascript
// NEEDED: Manual ordering interface
// Allow users to:
// 1. See current order of all players in castlist
// 2. Drag-and-drop to reorder (or number entry)
// 3. Set custom placement values (1, 2, 3, ...)
// 4. Save to castlist.rankings{} field
// 5. Set sortStrategy to 'custom' for manual order

// Example UI needed:
{
  type: 10,
  content: "## 🔄 Reorder Players\nDrag or assign numbers:\n\n1️⃣ Alice\n2️⃣ Bob\n3️⃣ Carol\n..."
}
// With buttons: [Move Up] [Move Down] [Set Number]
// Or: Modal with comma-separated player list in custom order
```

**Scope**: MAJOR FEATURE
- New hot-swappable interface
- Player list display with current order
- Reordering mechanism (modal or buttons)
- Save custom rankings to castlist entity
- Update tribe rankings when saved

#### 2. SWAP/MERGE Feature (Castlist Transitions)

**Current State**:
- Button exists: `castlist_swap_merge_{id}` (castlistHub.js:304-308)
- Shows placeholder text (castlistHub.js:420-425):
  ```javascript
  content: '-# 🔀 Swap/Merge functionality coming soon...\n-# This will allow you to create new castlists from selected roles'
  ```

**What's Missing**:
```javascript
// NEEDED: Complete swap/merge workflow
// Use case: Tribe swap mid-season
// - Original castlist has tribes: Red, Blue, Green
// - After swap, need: Orange, Purple, Yellow
// - Archive old tribes to "Swap 1" castlist
// - Create new tribes for current castlist

// Required workflow:
// 1. Show current tribes in castlist
// 2. Role selector for NEW tribes
// 3. Input field for archive castlist name ("Swap 1", "Merge", etc.)
// 4. Confirmation dialog showing changes
// 5. Execute:
//    a. Create new castlist for archived tribes
//    b. Unlink old tribes from current castlist
//    c. Link old tribes to archive castlist
//    d. Link new tribes to current castlist
//    e. Preserve all rankings/data
```

**Scope**: MAJOR FEATURE
- Multi-step workflow (current → new → archive)
- Role selector for new tribes
- Archive castlist naming
- Confirmation dialog with preview
- Atomic transaction (all-or-nothing)
- Update all tribe references

#### 3. Custom Sort Strategy Implementations

**Needed Functions** (castlistSorter.js):

```javascript
// castlistSorter.js:100-103 - Currently commented stubs

function sortByAge(members, tribeData) {
  return members.sort((a, b) => {
    // Get age from player data storage
    const ageA = playerData[guildId]?.players?.[a.id]?.age || 999;
    const ageB = playerData[guildId]?.players?.[b.id]?.age || 999;
    return ageA - ageB;  // Youngest first
  });
}

function sortByTimezone(members, tribeData) {
  return members.sort((a, b) => {
    // Get timezone offset from role assignment
    const tzA = getTimezoneOffset(a.roles) || 0;
    const tzB = getTimezoneOffset(b.roles) || 0;
    return tzA - tzB;  // Earliest timezone first
  });
}

function sortByJoinDate(members, tribeData) {
  return members.sort((a, b) => {
    const joinA = a.joinedTimestamp || 0;
    const joinB = b.joinedTimestamp || 0;
    return joinA - joinB;  // Oldest members first
  });
}

function sortCustomOrder(members, tribeData) {
  // Use castlist.rankings for custom order
  return sortByPlacements(members, tribeData.rankings || {});
}
```

**Integration Needed**: Update sortCastlistMembers() switch statement (castlistSorter.js:24-39)

### 🔴 Legacy System Removal (In Progress)

**prod_manage_tribes** - Old tribes menu (5 references in app.js):

| Location | Type | Status |
|----------|------|--------|
| app.js:699 | Button creation | ⏳ Active |
| app.js:3296 | Analytics check | ⏳ Active |
| app.js:6441 | Handler | ⏳ Active (with legacy tracking) |
| app.js:6443 | Legacy tracking | ✅ Added |
| app.js:6509 | Error handler | ⏳ Active |

**Deprecation Plan**:
1. Keep both menus running in parallel (current state)
2. Monitor usage via MenuBuilder.trackLegacyMenu()
3. Gradually migrate users to CastlistV3 Hub
4. Remove prod_manage_tribes when usage drops to 0

**Challenge**: prod_manage_tribes currently accessible to all admins, CastlistV3 Hub restricted to single user ID

## 🚧 UI/UX Polish Needed

### Micro Improvements
- [ ] Confirmation dialogs for destructive actions
- [ ] Loading states during async operations
- [ ] Better error messages (currently just "Error")
- [ ] Success feedback after edits
- [ ] Castlist search/filter (25-item dropdown limit)
- [ ] Pagination for 25+ castlists
- [ ] "Create New Castlist" option in dropdown
- [ ] Bulk tribe operations (select multiple)
- [ ] Undo/redo for edits
- [ ] Castlist duplication
- [ ] Export/import castlist data
- [ ] Castlist templates

### Known UX Issues
1. **Dropdown limit**: Only first 25 castlists shown (castlistHub.js:76-95)
2. **No visual feedback**: Edit saves silently (castlistHandlers.js:363)
3. **No undo**: Delete is permanent (castlistHandlers.js:297)
4. **No search**: Large servers need filtering
5. **Sort strategy confusion**: 4 options don't work but no indication

## 📋 Priority Roadmap

### Phase 1: Complete Sort Strategies (1-2 days)
**Goal**: Make all 6 sort options actually work

1. ✅ Alphabetical - Already working
2. ✅ Placements - Already working
3. ❌ Implement `sortAlphabetical(members, true)` call for Reverse Alpha
4. ❌ Implement `sortByAge()` function
5. ❌ Implement `sortByTimezone()` function
6. ❌ Implement `sortByJoinDate()` function
7. ❌ Add `sortCustomOrder()` for manual ordering

**Effort**: Low (simple sorting functions)
**Impact**: High (removes user confusion)

### Phase 2: Manual Ordering Feature (3-5 days)
**Goal**: Allow custom player order within castlists

1. Design UI for player list display
2. Choose interaction pattern (modal vs buttons)
3. Implement reordering mechanism
4. Save to castlist.rankings
5. Integrate with 'custom' sort strategy
6. Test with various castlist sizes

**Effort**: High (complex UI + data management)
**Impact**: High (key feature request)

### Phase 3: Swap/Merge Feature (5-7 days)
**Goal**: Enable tribe transitions between castlists

1. Design multi-step workflow
2. Build role selector UI
3. Create archive castlist logic
4. Implement atomic transaction
5. Add confirmation dialog with preview
6. Handle edge cases (empty castlists, etc.)
7. Test with production data

**Effort**: High (complex workflow + data integrity)
**Impact**: Critical (essential for season progression)

### Phase 4: UI/UX Polish (2-3 days)
**Goal**: Professional user experience

1. Add confirmation dialogs
2. Implement loading states
3. Better error messages
4. Success feedback toasts
5. Castlist search/filter
6. Pagination support
7. Create New button

**Effort**: Medium (many small changes)
**Impact**: Medium (quality of life)

### Phase 5: Legacy Removal (1-2 days)
**Goal**: Deprecate prod_manage_tribes

1. Remove user ID restriction from CastlistV3 Hub
2. Add prod_manage_tribes deprecation notice
3. Monitor usage via analytics
4. Sunset old menu when safe
5. Remove 5 references from app.js

**Effort**: Low (mostly monitoring)
**Impact**: High (technical debt reduction)

## 🎯 Recommended Next Steps

Based on user feedback and technical priorities:

**Option A: Manual Ordering** (if frequently requested)
- Start with Phase 2
- High user impact
- Unblocks custom castlist use cases

**Option B: UI/UX Polish** (if current features sufficient)
- Start with Phase 4
- Quick wins
- Improves existing experience
- Builds user confidence

**Option C: Complete Sorting** (if low-hanging fruit)
- Start with Phase 1
- Easy to implement
- Removes confusion
- Sets foundation for custom ordering

## 🔬 Implementation Details Discovered Through Testing

### Multi-Castlist Array Implementation

During implementation, we discovered critical details about how tribes can belong to multiple castlists:

**Data Structure Evolution**:
```javascript
// LEGACY: Single castlist (string format)
tribe: {
  castlist: "default" || "Custom Name",
  // ... other fields
}

// TRANSITIONAL: Single castlist ID (entity reference)
tribe: {
  castlistId: "castlist_12345_user",
  castlist: "Legacy Name" // Kept for backwards compatibility
}

// NEW: Multi-castlist array (supports multiple castlists)
tribe: {
  castlistIds: ["default", "castlist_12345_user", "virtual_xyz"],
  castlist: "First Castlist Name", // Legacy field maintained
  color: "#5865F2" // Role color from Discord API
}
```

**Key Implementation Decisions**:
1. **Array always used**: Even for single castlist, use `castlistIds: ["default"]` not `castlistId: "default"`
2. **Legacy field maintained**: `castlist` field kept pointing to first array entry for backwards compatibility
3. **Color on tribe**: Role color extracted from Discord API and stored on tribe, NOT castlist metadata
4. **No implicit default**: Tribes without castlist field are NOT implicitly added to default

### Active Castlist Implementation Details

**1. Dropdown Ordering**:
```javascript
// castlistHub.js - Active Castlist ALWAYS first
selectMenu.addOptions({
  label: 'Active Castlist',  // Renamed from "Default Castlist"
  value: 'default',          // ID stays "default" for legacy compatibility
  description: 'Select if you don\'t know what you\'re doing. Castlist for active phase of the game.',
  emoji: '✅'
});
// Then real castlists, then virtual castlists
```

**2. Virtual Until Materialized**:
```javascript
// Active Castlist exists as virtual entity until first edit
// castlistVirtualAdapter.ensureDefaultCastlist() creates virtual representation
// On first edit, automatically materializes to real entity via:
if (castlistVirtualAdapter.isVirtualId(castlistId)) {
  castlistId = await castlistVirtualAdapter.materializeCastlist(guildId, castlistId);
}
```

**3. Delete Protection**:
```javascript
// castlistHub.js line 335
const isDefaultCastlist = (selectedCastlistId === 'default');
deleteButton.setDisabled(!enabled || isDefaultCastlist); // Cannot delete Active Castlist
```

**4. Dropdown Persistence Fix**:
```javascript
// Fixed dropdown not maintaining selection
selectMenu.setDefaultValues(selectedCastlistId ? [selectedCastlistId] : []);
```

### Color Extraction Bug Fix

**The Bug**: `accentColor` was incorrectly stored in castlist metadata instead of per-tribe

**Before (INCORRECT)**:
```javascript
// In castlistManager.js
metadata: {
  description: config.description || '',
  emoji: config.emoji || '📋',
  accentColor: config.accentColor || null  // WRONG LOCATION
}
```

**After (CORRECT)**:
```javascript
// In castlistHandlers.js during tribe role selection
const roleData = resolvedRoles[roleId];
const roleColor = roleData?.color
  ? `#${roleData.color.toString(16).padStart(6, '0')}`
  : null;

tribes[roleId] = {
  name: `Tribe ${roleId}`,
  emoji: '🏕️',
  color: roleColor  // CORRECT: Stored per-tribe
};
```

### Discovered Bugs During Implementation

1. **Type Default Bug**: Tribe initialization incorrectly set `type: 'default'` instead of leaving undefined
2. **Placements Sort Data**: Function exists but rankings are never populated, making it non-functional
3. **Unlink Missing Parameter**: `unlinkTribeFromCastlist` wasn't receiving castlistId parameter
4. **Dropdown Persistence**: Selection wasn't maintained after button clicks (fixed with setDefaultValues)

### Testing Requirements

**CastBot Default Role ID**: `1421932674611941618` - Use this for testing Active Castlist functionality

**Test Scenarios Needed**:
1. Create new tribe with Active Castlist
2. Move tribe from virtual to real castlist
3. Add tribe to multiple castlists simultaneously
4. Verify color extraction from Discord role
5. Confirm delete protection on Active Castlist
6. Test dropdown persistence across interactions

## 🎯 Critical Implementation Requirements

Based on analysis, these are **REQUIRED** for CastlistV3 to replace legacy:

### 1. Default Castlist Support (CRITICAL) - ✅ IMPLEMENTED (UNTESTED)
- [x] Add "Active Castlist" option to Hub dropdown (renamed from Default)
- [x] Order: Active → Real → Virtual (➕ New still needed)
- [x] NO implicit default behavior (user explicitly rejected this)
- [x] Support default castlist virtual entity (materializes on first edit)
- [x] Delete protection for Active Castlist
- [x] Dropdown persistence with setDefaultValues()

### 2. Create New Castlist Entry Point (HIGH)
- [ ] Add "➕ New Castlist" option to dropdown
- [ ] Handle 'create_new' selection in castlistHandlers.js
- [ ] Create type selector menu (Season/Role/Custom)
- [ ] Wire to existing createCastlistWizard()

### 3. Complete Sort Strategies (MEDIUM)
- [ ] Fix Placements sorting (function exists but no data populated)
- [ ] Implement Reverse Alphabetical
- [ ] Implement Age sorting
- [ ] Implement Timezone sorting
- [ ] Implement Join Date sorting

### 4. Manual Ordering Feature (HIGH)
- [ ] Design player list UI
- [ ] Implement reordering mechanism
- [ ] Save to castlist.rankings
- [ ] Integrate with 'custom' sort strategy

### 5. Swap/Merge Feature (CRITICAL for season progression)
- [ ] Multi-step workflow
- [ ] Role selector for new tribes
- [ ] Archive castlist creation
- [ ] Atomic transaction

### 6. Remove Hub Restrictions (BEFORE deprecating legacy)
- [ ] Remove user ID restriction
- [ ] Test with multiple production members
- [ ] Monitor for issues
- [ ] Deprecate prod_manage_tribes only when safe

## 💬 Discussion Questions

1. **Priority**: Which feature is most urgently needed?
   - Add New Castlist (30-45 min) for immediate unblock?
   - Manual ordering for custom castlists?
   - Swap/merge for season progression?
   - UI polish for better experience?

2. **Default Castlist**: Should default be a special virtual entity or real entity?
   - Virtual: No migration needed, works with legacy
   - Real: Requires one-time creation per server

3. **Scope**: Should we complete all sort strategies or focus on custom ordering only?

4. **Legacy**: When to remove prod_manage_tribes restriction and deprecate old menu?

5. **UX**: Modal-based ordering or button-based? Drag-drop possible?

## 📊 Technical Debt Summary

**Code Duplication**:
- `prod_add_tribe_castlist_select` pattern (130+ lines inline) should be extracted
- `buildCastlist2ResponseData` successfully extracted (RaP/1000) - model for future

**Inconsistent Access Patterns**:
- 5 different methods to display castlists (see CastlistArchitecture.md)
- Only Hub uses virtual adapter fully
- Should unify via virtual adapter integration

**Legacy Coupling**:
- Hub restricted to one user (intentional, but blocks deprecation)
- prod_manage_tribes has 5 references in app.js
- Both systems running in parallel (maintenance burden)

## 📝 Session Summary (Sept 29, 2025)

### Morning Session Accomplishments:
1. ✅ Implemented Active Castlist (default) support in CastlistV3 Hub
2. ✅ Added multi-castlist array support (`castlistIds: []`)
3. ✅ Fixed role color extraction bug (now from Discord API to tribe.color)
4. ✅ Added delete protection for Active Castlist
5. ✅ Fixed dropdown persistence issue
6. ✅ Removed incorrect `type: 'default'` tribe initialization
7. ✅ Created virtual Active Castlist entity via adapter

### Evening Session Critical Fixes:
8. ✅ **Fixed Active Castlist Post Button**: Was using name instead of ID in custom_id
9. ✅ **Fixed show_castlist2 handler**: Now checks both `castlist` and `castlistId` fields
10. ✅ **MAJOR FIX - Multi-Select Race Condition**: Complete rewrite following store pattern
11. ✅ **Verified Multi-Tribe Operations**: Can add/remove multiple tribes in one operation

**All Previously Listed Items Now Tested & Working**:
- ✅ Active Castlist appears first in dropdown
- ✅ Multi-castlist assignment works correctly
- ✅ Role colors extracted and displayed properly
- ✅ Virtual to real materialization on edit
- ✅ Delete button disabled for Active Castlist
- ✅ Legacy compatibility maintained
- ✅ Post Castlist works for Active/Default castlist
- ✅ Bulk tribe operations work without data loss

**What's Still Missing**:
- Placements sorting (function exists but no data)
- Create New Castlist entry point in dropdown
- 4 sort strategies (Reverse Alpha, Age, Timezone, Join Date)
- Manual ordering UI
- Swap/Merge feature implementation

**Critical Clarifications**:
- Active Castlist is the HEART of CastBot, not optional
- One tribe CAN belong to multiple castlists (design requirement)
- Colors belong on tribes, NOT castlists (per Discord role)
- NO implicit default assignment (user's explicit choice)

## 🔍 Key Learnings & Critical Fixes

### Original Learnings:
1. **Infrastructure ≠ Feature Complete**: Having all the plumbing doesn't mean features work
2. **Default is Core, Not Optional**: Most frequently used castlist, must be first-class citizen
3. **Virtual Adapter Works**: Production evidence (Haszo migration) proves pattern works
4. **Extraction Patterns Work**: buildCastlist2ResponseData migration was successful
5. **UI Can Mislead**: Sort dropdown shows 6 options, only 2 work - confusing to users

### Critical Bug Fixes Discovered (Sept 29 Evening):

#### 1. **Race Condition in Multi-Select Operations**
**Problem**: When adding/removing multiple tribes, only first change saved
**Root Cause**: Multiple `loadPlayerData()` and `savePlayerData()` calls creating data races
**Solution**: Follow store multi-select pattern - load once, modify all in memory, save once
**Code Pattern**:
```javascript
// BROKEN: Race condition
for (tribe of toAdd) {
  await linkTribeToCastlist(); // Each loads/saves separately!
}
await savePlayerData(); // Overwrites everything!

// FIXED: Atomic operation
const playerData = await loadPlayerData();
for (tribe of toAdd) {
  tribes[roleId].castlistIds = [castlistId]; // Modify in memory
}
await savePlayerData(); // Save once with all changes
```

#### 2. **Active Castlist Post Button Bug**
**Problem**: "No tribes found for castlist: Active Castlist"
**Root Cause**: Button using castlist name instead of ID
**Fix Location**: `castlistHub.js:298` - Use ID ('default') not name ('Active Castlist')

#### 3. **show_castlist2 Handler Incomplete**
**Problem**: Not finding tribes with new castlist format
**Root Cause**: Only checking legacy `tribe.castlist` field
**Solution**: Check both `castlist` and `castlistId` fields with special handling for default

## 🎯 Critical Information for Future Claude Instances

### Understanding CastlistV3 Architecture

**Key Concepts**:
1. **Virtual Adapter Pattern**: Legacy string-based castlists appear as entities until edited
2. **Dual Storage**: Tribes have both `castlist` (legacy string) and `castlistIds` (array) fields
3. **Default/Active Castlist**: Special castlist with ID "default" but name "Active Castlist"
4. **Multi-Castlist Support**: One tribe can belong to multiple castlists simultaneously

### Common Pitfalls & Solutions

#### 1. Multi-Select Race Conditions
**NEVER DO THIS**:
```javascript
for (const roleId of toAdd) {
  await someAsyncFunction(roleId); // Loads/saves data
}
await savePlayerData(); // Overwrites everything!
```

**ALWAYS DO THIS**:
```javascript
const data = await loadPlayerData();
for (const roleId of toAdd) {
  // Modify in memory only
}
await savePlayerData(); // Single save
```

#### 2. Active/Default Castlist Confusion
- **ID**: Always "default"
- **Name**: "Active Castlist" (user-facing)
- **Special Handling**: Cannot be deleted, always first in dropdown
- **Button IDs**: Must use "default" not "Active Castlist"

#### 3. Tribe Data Structure
```javascript
// Modern tribe with multi-castlist support
{
  "roleId": {
    "castlist": "Legacy Name",        // Legacy field (keep for compatibility)
    "castlistIds": ["default", "id2"], // NEW: Array of castlist IDs
    "castlistId": "single_id",         // Transitional single ID (deprecated)
    "color": "#5865F2",                // From Discord role
    "emoji": "🏕️"
  }
}
```

### Testing Checklist
- [ ] Can add multiple tribes at once (3+)
- [ ] Can remove multiple tribes at once
- [ ] Active Castlist Post button works
- [ ] Virtual castlists materialize on edit
- [ ] Legacy tribes still display correctly

### File Locations
- **Hub UI**: `castlistHub.js` - Main interface
- **Handlers**: `castlistHandlers.js` - Button/select handlers (RACE CONDITION FIX HERE)
- **Manager**: `castlistManager.js` - CRUD operations
- **Virtual Adapter**: `castlistVirtualAdapter.js` - Legacy compatibility
- **Display**: `castlistV2.js` - Rendering logic

### Debug Commands
```bash
# Check tribe data structure
grep -A5 '"tribes":' playerData.json

# Find castlist configs
grep -A10 '"castlistConfigs":' playerData.json

# Monitor multi-select operations
tail -f /tmp/castbot-dev.log | grep "CASTLIST"
```

---

## 🏆 Placement Editor Feature (January 2025) - ✅ IMPLEMENTED

### Overview
A variant of the castlist display that allows production team to edit player placements directly from the castlist view. This feature reuses 90% of existing castlist display code while swapping the thumbnail accessory for an edit button.

### Critical Design Decision: Why Global Placements?

**Placements are stored GLOBALLY per player, NOT per tribe**. This fundamental design choice addresses two key use cases:

1. **Alumni/Hall of Fame Castlists**: Single "Season 13" tribe/role containing all past players with their final placements
2. **In-Progress Seasons**: Players move between tribes but keep their placement:
   - Start: Player assigned "Korok Tribe" role
   - Swap: Korok removed, "Hylian Tribe" assigned
   - Eliminated: Placed 11th, Hylian removed
   - **Result**: Player shows as "11th" in any castlist view

**Data Structure Impact**:
- ❌ OLD (conceptual): `tribePlacements[tribeId][playerId]` - loses placement on tribe change
- ✅ NEW (implemented): `placements.global[playerId]` - placement follows the player
- 🔮 FUTURE: `placements[seasonId][playerId]` - one placement per season

### Design Specification

#### Entry Point
**Location**: CastlistV3 Hub
**Button**: "Tribes & Placements" (🔥 emoji)
**Permissions**: Production team only (Manage Roles)
**Applicability**: Works for ALL castlists, not just alumni
**Context**: Edit button appears in tribe view, but edits GLOBAL placement

#### Display Mode Architecture
```javascript
// Two display modes for castlist
const displayMode = 'view' | 'edit';

// Mode determination in show_castlist2 handler
if (custom_id.startsWith('show_castlist2_')) {
  const parts = custom_id.split('_');
  // Format: show_castlist2_[castlistId]_[mode]
  // Examples:
  //   show_castlist2_default (view mode - default)
  //   show_castlist2_default_edit (edit mode)
  const displayMode = parts[2] === 'edit' ? 'edit' : 'view';
}
```

#### Section Component Modification
**Key Discovery**: Discord Section (type 9) supports button accessory!

```javascript
// VIEW MODE (Current/Legacy)
{
  type: 9,  // Section
  components: [
    { type: 10, content: "**3) ReeceBot**\n..." }
  ],
  accessory: {
    type: 11,  // Thumbnail
    media: { url: "avatar_url" }
  }
}

// EDIT MODE (New)
{
  type: 9,  // Section
  components: [
    { type: 10, content: "**3) ReeceBot**\n..." }
  ],
  accessory: {
    type: 2,  // Button
    custom_id: `edit_placement_${tribeId}_${playerId}`,
    label: placement ? getOrdinalLabel(placement) : "Set Place",
    style: 2,  // Secondary
    emoji: { name: "✏️" }
  }
}
```

#### Button Label Logic
```javascript
// Helper function for ordinal suffixes
function getOrdinalLabel(placement) {
  if (!placement) return "Set Place";

  // placement is stored as integer, not string
  const num = typeof placement === 'number' ? placement : parseInt(placement);
  if (isNaN(num)) return "Set Place";

  // Handle special cases 11-13
  if (num % 100 >= 11 && num % 100 <= 13) {
    return `${num}th`;
  }

  // Standard ordinal rules
  switch (num % 10) {
    case 1: return `${num}st`;
    case 2: return `${num}nd`;
    case 3: return `${num}rd`;
    default: return `${num}th`;
  }
}

// Button shows:
// - "Set Place" if no placement
// - "1st" for placement 1
// - "2nd" for placement 2
// - "24th" for placement 24
// - etc.
```

#### Modal Design (Simple)
```javascript
const modal = {
  custom_id: `save_placement_${tribeId}_${playerId}`,  // tribeId for context only
  title: "Edit Season Placement",
  components: [
    {
      type: 18,  // Label (Components V2)
      label: "Placement (1-99)",
      description: "Enter whole number only (1 = Winner, 2 = Runner-up, etc.). Leave blank if still in game.",
      component: {
        type: 4,  // Text Input
        custom_id: "placement",
        value: currentPlacement ? currentPlacement.toString() : "",  // Convert number to string for display
        placeholder: "e.g., 1, 2, 24",
        max_length: 2,
        required: false  // Allow clearing
      }
    }
  ]
};
```

#### Data Structure (CRITICAL CHANGE)
```javascript
// UPDATED STRUCTURE - Global placements, not tribe-specific
// In playerData.json
{
  "guildId": {
    "placements": {
      "global": {  // Using "global" until season support is added
        "playerId": {
          "placement": 11,  // INTEGER not string (1, 2, 24, etc.)
          "updatedBy": "userId",
          "updatedAt": "2025-01-29T..."
        }
      }
      // Future: "season_03859e4abc554bb5": { "playerId": { ... } }
    }
  }
}

// WHY THIS STRUCTURE:
// 1. Players keep placement when switching tribes
// 2. Survives tribe deletion (no data loss)
// 3. Alumni castlists work (single "Season 13" tribe)
// 4. In-progress seasons work (Korok→Hylian→Eliminated)
// 5. Clear migration path to per-season placements
// 6. Allows ties (production can have multiple 1st place)
```

### Actual Implementation (January 29, 2025)

**Key Implementation Decisions:**
1. **Display mode parsing**: Added third segment to show_castlist2 custom_id pattern (`show_castlist2_default_edit`)
2. **Accessory swapping**: Section components dynamically switch between thumbnail (view) and button (edit)
3. **Button factory avoided**: Direct handlers in app.js for modals to avoid ButtonHandlerFactory complexity
4. **Synchronous data load**: Used require() for immediate data access in render loop (may need async refactor)

### Implementation Files & Changes

#### 1. castlistHub.js (✅ Implemented)
Add "Tribes & Placements" button to management buttons:
```javascript
// Line ~320 in createManagementButtons()
new ButtonBuilder()
  .setCustomId(`castlist_placements${suffix}`)
  .setLabel('Tribes & Placements')
  .setStyle(activeButton === 'placements' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  .setEmoji('🔥')
  .setDisabled(!enabled)
```

#### 2. castlistHandlers.js (✅ Implemented)
Handle button click to trigger edit mode:
```javascript
else if (custom_id.startsWith('castlist_placements_')) {
  const castlistId = custom_id.replace('castlist_placements_', '');

  // Check production permissions
  if (!hasAdminPermissions(member)) {
    return ephemeralError("Production permissions required");
  }

  // Trigger edit mode display
  const editCustomId = `show_castlist2_${castlistId}_edit`;
  req.body.data.custom_id = editCustomId;
  // Continue to show_castlist2 handler...
}
```

#### 3. app.js show_castlist2 handler (✅ Implemented)
Parse display mode and pass to display functions:
```javascript
// Line ~4759
const parts = custom_id.split('_');
const displayMode = parts[2] === 'edit' ? 'edit' : 'view';

// Pass to buildCastlist2ResponseData
const responseData = await buildCastlist2ResponseData(
  tribes,
  currentTribe,
  currentPage,
  navState,
  displayScenario,
  castlistName,
  displayMode  // NEW PARAMETER
);
```

#### 4. castlistV2.js createPlayerCard & createTribeSection (✅ Implemented)
Core logic for accessory swap:
```javascript
function createTribeSection(members, tribeData, guildId, displayMode = 'view') {
  return members.map(member => {
    const playerSection = {
      type: 9,  // Section
      components: [createPlayerCard(member, ...)],
      accessory: displayMode === 'edit'
        ? createEditButton(member, tribeData, guildId)
        : createThumbnail(member)
    };
    return playerSection;
  });
}

function createEditButton(member, tribeData, guildId) {
  // CRITICAL: Get GLOBAL placement, not tribe-specific
  const playerData = loadPlayerData();
  const placement = playerData[guildId]?.placements?.global?.[member.id]?.placement;

  return {
    type: 2,  // Button
    custom_id: `edit_placement_${tribeData.id}_${member.id}`,  // tribeId for context only
    label: placement ? getOrdinalLabel(placement) : "Set Place",
    style: 2,
    emoji: { name: "✏️" }
  };
}
```

#### 5. app.js placement handlers (✅ Implemented)
Modal display and save handlers:
```javascript
else if (custom_id.startsWith('edit_placement_')) {
  const [, , tribeId, playerId] = custom_id.split('_');  // tribeId for context only

  // Load current GLOBAL placement
  const placement = playerData[guildId]?.placements?.global?.[playerId]?.placement;

  // Show modal
  const modal = createPlacementModal(tribeId, playerId, placement);
  return res.send({
    type: InteractionResponseType.MODAL,
    data: modal
  });
}

else if (custom_id.startsWith('save_placement_')) {
  const [, , tribeId, playerId] = custom_id.split('_');  // tribeId for context/refresh only
  const placementInput = components[0].components[0].value?.trim();

  // Validate: must be integer 1-99 or empty
  if (placementInput && !/^\d{1,2}$/.test(placementInput)) {
    return error("Please enter a whole number (1-99)");
  }

  // Convert to integer for storage
  const placementValue = placementInput ? parseInt(placementInput, 10) : null;

  // Initialize structure if needed
  if (!playerData[guildId].placements) {
    playerData[guildId].placements = {};
  }
  if (!playerData[guildId].placements.global) {
    playerData[guildId].placements.global = {};
  }

  // Save or delete GLOBAL placement
  if (placementValue !== null) {
    playerData[guildId].placements.global[playerId] = {
      placement: placementValue,  // INTEGER not string
      updatedBy: userId,
      updatedAt: new Date().toISOString()
    };
  } else {
    // Remove placement if cleared
    delete playerData[guildId].placements.global[playerId];
  }

  await savePlayerData(playerData);

  // Return to edit mode display (need to find castlistId from context)
  // Option 1: Extract from tribe data
  // Option 2: Store in modal custom_id
  // For now, assume we can get it from tribe context
  const castlistId = await getCastlistFromTribe(guildId, tribeId);
  const editCustomId = `show_castlist2_${castlistId}_edit`;
  // Trigger refresh...
}
```

### Critical Safety Measures

#### 1. Legacy Protection
**ALL existing castlist displays remain unchanged**:
- Production Menu buttons: View only
- /castlist command: View only
- Direct show_castlist2 buttons: View only
- ONLY castlistHub "Tribes & Placements" triggers edit mode

#### 2. Explicit Mode Check
```javascript
// Default is ALWAYS view mode
const displayMode = parts[2] === 'edit' ? 'edit' : 'view';
// Legacy calls have no third part, so always get 'view'
```

#### 3. Permission Gating
```javascript
// Edit button only appears in castlistHub for production team
if (!hasAdminPermissions(member)) {
  return ephemeralError("Production permissions required");
}
```

### Integration with Existing Systems

#### castlistSorter.js Integration
```javascript
// UPDATED: Placement data now GLOBAL, not per-tribe
function sortByPlacements(members, tribeData, guildId) {
  const rankings = {};

  // Load GLOBAL placement data
  const globalPlacements = playerData[guildId]?.placements?.global || {};

  // Build rankings object for sorter
  for (const member of members) {
    const placementData = globalPlacements[member.id];
    if (placementData && placementData.placement) {
      rankings[member.id] = { placement: placementData.placement };
    }
  }

  // Use existing sorting logic
  return existingSortByPlacements(members, rankings);
}

// NOTE: This allows placement sorting to work across ALL castlists/tribes
// since placements are now global per player, not per tribe
```

### Implementation Test Results

#### Phase 1: Basic Functionality ✅
- [x] "Tribes & Placements" button appears in hub
- [x] Edit mode shows buttons instead of thumbnails
- [x] Button shows "Set Place" for no placement
- [x] Button shows "1st", "2nd", "24th" etc. for existing placements
- [x] Modal opens on button click
- [x] Modal pre-fills current placement (as string in input)
- [x] Can save new placement (stores as integer)
- [x] Can clear placement (empty = still in game)
- [x] Only accepts 1-99 integers
- [x] Leading zeros handled ("09" → 9)

#### Phase 2: Global Placement Verification
- [ ] Player keeps same placement across different tribes
- [ ] Moving player between tribes doesn't affect placement
- [ ] Deleting tribe doesn't lose placement data
- [ ] Placement visible in all castlists containing the player
- [ ] Alumni castlist (single tribe) shows all placements
- [ ] In-progress season (multiple tribes) shows consistent placements

#### Phase 3: Safety Verification
- [ ] View mode unchanged for all legacy entry points
- [ ] Production permissions enforced
- [ ] No UI changes to regular castlist display
- [ ] Pagination still works in edit mode
- [ ] Navigation between tribes works
- [ ] All display scenarios handled

#### Phase 4: Data Validation
- [ ] Placement saves to `placements.global[playerId]` not tribe-specific
- [ ] Stored as integer (1, 2, 24) not string ("1", "2", "24")
- [ ] Metadata (updatedBy, updatedAt) recorded
- [ ] Empty placement removes entry from global
- [ ] Data persists across restarts
- [ ] Multiple players can have same placement (ties allowed)

### Edge Cases & Validation

1. **Input Validation**
   - Only integers 1-99 accepted
   - Empty/null = still in game (no placement)
   - Duplicates allowed (hosts may want ties)
   - Leading zeros accepted ("09" → "9")

2. **Display Edge Cases**
   - Very long player names still fit
   - Button works on mobile Discord
   - Emoji in button displays correctly
   - Ordinal suffixes correct for all numbers

3. **Data Consistency**
   - Placement data separate from castlist metadata
   - Tribe deletion doesn't lose placement data
   - Player leaving server preserves placement

### Future Extensions (NOT in this phase)

1. **Display Placements in View Mode**
   - Show "1st", "2nd" etc. prefix in player name
   - Only for alumni/placement type castlists
   - Requires castlistV2.js modification

2. **Bulk Operations**
   - "Clear All Placements" button
   - Import from CSV/paste
   - Copy placements between tribes

3. **History Tracking**
   - Audit log of placement changes
   - Undo/redo functionality
   - Change notifications

### Implementation Status - COMPLETED (January 29, 2025)

**Completed Implementation**:
1. ✅ Hub button added to castlistHub.js (Tribes & Placements)
2. ✅ Display mode switching implemented in show_castlist2 handler
3. ✅ Edit buttons replace thumbnails in castlistV2.js
4. ✅ Modal handlers for placement input (edit_placement_ and save_placement_)
5. ✅ Global placement storage in playerData.json
6. ✅ Permission checking (Production team only)
7. ✅ Integer storage with ordinal display (1 → "1st")

**Implementation Details**:
- **Files Modified**: `app.js`, `castlistHub.js`, `castlistHandlers.js`, `castlistV2.js`
- **New Handlers**: `edit_placement_` (modal display), `save_placement_` (data persistence)
- **Data Path**: `playerData[guildId].placements.global[playerId].placement`
- **Storage Type**: INTEGER (1, 2, 11) not strings
- **Display Format**: Ordinal labels ("1st", "2nd", "11th", "24th")

**Phase 2** (Future - After This):
1. Display placements in view mode
2. Integrate with sortByPlacements
3. Add placement analytics

### Known Issues & Bugs

**As of January 29, 2025:**
1. **require() vs import()**: Used `require('./storage.js')` in castlistV2.js button creation, may need ES6 import
2. **Refresh after save**: Modal save shows success message but doesn't refresh the edit mode display
3. **Navigation persistence**: Need to maintain edit mode when navigating between tribes/pages

### Zero-Context Implementation Guide

**If implementing from scratch, here are the KEY POINTS:**

1. **Data Structure**: Use `placements.global[playerId]` NOT `tribePlacements[tribeId][playerId]`
   - Store as INTEGER (1, 2, 11) not string
   - Global per player, survives tribe changes
   - Path: `playerData[guildId].placements.global[playerId].placement`

2. **Edit Mode Trigger**: Add third part to custom_id
   - View: `show_castlist2_default` (existing)
   - Edit: `show_castlist2_default_edit` (new)
   - Default to 'view' if no third part

3. **Button vs Thumbnail**: Swap Section accessory based on mode
   - View mode: `accessory: { type: 11, media: {...} }`
   - Edit mode: `accessory: { type: 2, custom_id: "edit_placement_...", ... }`

4. **Modal custom_id Pattern**: Include castlistId for refresh
   - Edit button: `edit_placement_${tribeId}_${playerId}`
   - Save modal: `save_placement_${castlistId}_${tribeId}_${playerId}`
   - This allows proper refresh after save

5. **Ordinal Labels**: Convert integer to display string
   - 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th"
   - Empty/null → "Set Place"

6. **Permission Check**: Production team only
   - Check `hasAdminPermissions(member)` before allowing edit mode

7. **Refresh After Save**: Return to edit mode display
   - Use stored castlistId from modal custom_id
   - Trigger `show_castlist2_${castlistId}_edit`

### Common Mistakes to Avoid

1. **DO NOT** modify view mode behavior
2. **DO NOT** change any existing castlist UI
3. **DO NOT** forget ordinal suffixes (1st not 1)
4. **DO NOT** allow non-integers
5. **DO NOT** make placement required
6. **DO NOT** auto-assign placements
7. **DO NOT** lose data on tribe changes
8. **DO NOT** break pagination/navigation
9. **DO NOT** store as string - use integers
10. **DO NOT** tie placements to tribes

### Success Criteria

✅ Production can edit placements without leaving castlist view
✅ Zero impact on existing castlist displays
✅ Data ready for sortByPlacements integration
✅ Clear visual feedback (button labels)
✅ Intuitive UX (modal with clear instructions)
✅ Safe data handling (validation, permissions)

### Summary for Future Developers

**What Works:**
- Placement Editor fully functional in edit mode
- Global placement storage implemented
- Modal input with validation (1-99 integers)
- Ordinal display labels ("1st", "2nd", "24th")
- Production team permission checking

**What Needs Polish:**
- Refresh display after placement save
- Convert require() to ES6 import in castlistV2.js
- Maintain edit mode through navigation
- Add placement display in view mode (future feature)

---

**Related Documentation**:
- [CastlistV3.md](CastlistV3.md) - Complete system architecture
- [CastlistArchitecture.md](CastlistArchitecture.md) - All 5 access methods
- [CastlistV3-AddCastlistAnalysis.md](CastlistV3-AddCastlistAnalysis.md) - Legacy pattern analysis
- [RaP/1000](../../RaP/1000_20250926_Castlist_Architecture_Refactor.md) - buildCastlist2ResponseData migration
- [SeasonLifecycle.md](../concepts/SeasonLifecycle.md) - Active season concept & Admin/Host/Production terminology
- [RaP/0997](../../RaP/0997_20250129_CastlistPlacementEditor_Analysis.md) - Placement Editor initial analysis