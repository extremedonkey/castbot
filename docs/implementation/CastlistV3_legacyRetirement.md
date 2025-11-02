# CastlistV3 Legacy Retirement Plan

## Overview

This document tracks all work-in-progress and planned tasks for retiring the legacy tribe-based castlist system (`prod_manage_tribes`) and completing the CastlistV3 entity system migration.

**Status**: 🔴 PENDING - Legacy system still primary for 99% of users
**Target**: Full migration by Q2 2025

## 📋 Critical Path to Legacy Retirement

### Phase 1: Complete Virtual Adapter Integration ⏳

The Virtual Adapter is built but only CastlistV3 Hub uses it. These components need updating:

#### `/castlist` Command
**Current**: Direct string matching via `getGuildTribes()`
**Needed**: Use `castlistManager.getAllCastlists()` to leverage virtual adapter
```javascript
// Current (app.js:~2031)
const rawTribes = await getGuildTribes(guildId, castlistToShow);

// Target
const castlist = await castlistManager.getCastlist(guildId, castlistId);
const tribes = await getTribesForCastlist(guildId, castlist);
```

#### `show_castlist2` Handler
**Current**: Direct `playerData` access with string matching
**Needed**: Use virtual adapter for entity awareness
```javascript
// Current (app.js:~4805)
const guildTribes = playerData[guildId]?.tribes || {};

// Target
const allCastlists = await castlistManager.getAllCastlists(guildId);
const targetCastlist = [...allCastlists.values()]
  .find(c => c.name === castlistName || c.id === castlistName);
```

#### Production Menu Castlist Buttons
**Current**: Legacy string-based buttons
**Needed**: Entity-aware button generation

### Phase 2: Complete Missing Features 🔴

These features were designed but never implemented:

#### 1. Manual Ordering UI (3-5 days)
**Priority**: HIGH - Critical for custom castlist organization
**Design**:
```javascript
// Needed: Interface to reorder players
// 1. Display current order
// 2. Drag-drop or number assignment
// 3. Save to castlist.rankings{}
// 4. Set sortStrategy to 'custom'
```
**Implementation Tasks**:
- [ ] Create hot-swappable ordering interface
- [ ] Build player list with reorder controls
- [ ] Modal for comma-separated ordering
- [ ] Save rankings to entity
- [ ] Integrate with castlistSorter.js

#### 2. Swap/Merge Feature (5-7 days)
**Priority**: CRITICAL - Essential for season progression
**Use Case**: Tribe swaps mid-season
**Design**:
```javascript
// Multi-step workflow:
// 1. Show current tribes
// 2. Select new tribes (role selector)
// 3. Name archive castlist
// 4. Confirm changes
// 5. Execute atomic swap
```
**Implementation Tasks**:
- [ ] Build multi-step workflow UI
- [ ] Create role selector for new tribes
- [ ] Archive castlist creation logic
- [ ] Atomic transaction implementation
- [ ] Confirmation dialog with preview

#### 3. Sort Strategy Implementations (1-2 days)
**Priority**: MEDIUM - Users confused by non-working options
**Missing Functions**:
```javascript
// In castlistSorter.js - Currently stub implementations
function sortByAge(members, tribeData) { }      // Needs player age data
function sortByTimezone(members, tribeData) { }  // Needs timezone roles
function sortByJoinDate(members, tribeData) { }  // Needs member.joinedTimestamp
function sortCustomOrder(members, tribeData) { } // Needs rankings field
```
Also needed:
- [ ] Call `sortAlphabetical(members, true)` for Reverse Alpha
- [ ] Update switch statement in `sortCastlistMembers()`

#### 4. Create New Castlist Entry (30-45 mins)
**Priority**: HIGH - No way to create castlists in new system
**Current**: `createCastlistWizard()` exists but no entry point
**Needed**:
```javascript
// In castlistHub.js dropdown (line ~60-113)
selectMenu.addOptions({
  label: '➕ New Castlist',
  value: 'create_new',
  description: 'Create a new castlist',
  emoji: { name: '➕' }
});

// In handleCastlistSelect
if (selectedValue === 'create_new') {
  // Show creation type selector
  // Wire to createCastlistWizard()
}
```

### Phase 3: Remove User Restrictions 🚨

**Current State**: CastlistV3 Hub restricted to user ID `391415444084490240`
**Location**: `castlistHub.js:30` and button handler checks

**Prerequisites Before Removing**:
1. ✅ Default castlist bugs fixed (DONE Nov 2025)
2. ⏳ Virtual adapter in all display methods
3. ❌ Manual ordering implemented
4. ❌ Swap/merge implemented
5. ❌ All sort strategies working

### Phase 4: Deprecate `prod_manage_tribes` 🗑️

**Current**: 5 active references in app.js
| Location | Type | Action Needed |
|----------|------|---------------|
| app.js:699 | Button creation | Add deprecation notice |
| app.js:3296 | Analytics check | Keep for tracking |
| app.js:6441 | Handler | Replace with redirect to Hub |
| app.js:6443 | Legacy tracking | Keep for metrics |
| app.js:6509 | Error handler | Remove when deprecated |

**Deprecation Strategy**:
1. Add notice: "⚠️ Legacy Menu - Use Castlist Hub Instead"
2. Track usage via `MenuBuilder.trackLegacyMenu()`
3. Monitor analytics for 30 days
4. Remove when usage drops to zero

## 🔧 Technical Debt to Address

### 1. Duplicate `buildCastlist2ResponseData()` ✅
**Status**: COMPLETED - Moved from app.js to castlistV2.js
**Reference**: RaP/1000_20250926_Castlist_Architecture_Refactor.md

### 2. Inconsistent Data Access Patterns
**Problem**: 5+ different ways to access castlists
**Solution**: Unified service layer (CastlistService)
```javascript
// Target architecture
class CastlistService {
  async getCastlist(guildId, identifier) { }
  async getTribesForCastlist(guildId, castlist) { }
  async renderCastlist(castlist, tribes, options) { }
}
```

### 3. Direct `playerData` Access
**Problem**: Bypasses virtual adapter and caching
**Solution**: All access through `castlistManager`
**Locations to fix**:
- show_castlist2 handler
- Production menu buttons
- Navigation handlers

### 4. Missing Placement Editor Integration
**Status**: Placement Editor implemented (Jan 2025) but not integrated with sorting
**Needed**:
```javascript
// Connect placement data to sort function
function sortByPlacements(members, tribeData, guildId) {
  const globalPlacements = playerData[guildId]?.placements?.global || {};
  // Use placement data for sorting
}
```

## 📊 Migration Metrics

Track these metrics to measure progress:

```javascript
// Current State (Nov 2025)
{
  virtualAdapterAdoption: "20%",  // Only Hub uses it
  realEntities: "~5%",             // Very few materialized
  legacyDependencies: "80%",       // Most code uses strings
  userRestriction: true,           // Hub admin-only
  featuresComplete: "40%"          // Many designed, not built
}

// Target State (Q2 2025)
{
  virtualAdapterAdoption: "100%",
  realEntities: "50%+",
  legacyDependencies: "0%",
  userRestriction: false,
  featuresComplete: "100%"
}
```

## 🚧 Known Issues & Edge Cases

### 1. Default Castlist Materialization
**Fixed**: November 2025 - Now materializes on selection
**Previous Issue**: Was materializing at tribe management, causing duplicate code

### 2. Multi-Select Race Conditions
**Fixed**: September 2025 - Use atomic operations
**Pattern**: Load once, modify in memory, save once

### 3. Button ID Parsing for Default
**Fixed**: January 2025 - Special case for "default" without "castlist_" prefix

### 4. Tribes Without Castlist Fields
**Fixed**: November 2025 - Removed overly broad fallback logic
**Previous Issue**: All empty tribes included in default

## 📅 Implementation Timeline

### Sprint 1 (1 week)
- [ ] Add "➕ New Castlist" to dropdown
- [ ] Implement missing sort functions
- [ ] Fix Reverse Alpha sort call

### Sprint 2 (2 weeks)
- [ ] Build manual ordering UI
- [ ] Save rankings to entities
- [ ] Test with various castlist sizes

### Sprint 3 (2 weeks)
- [ ] Implement swap/merge workflow
- [ ] Build multi-step UI
- [ ] Add atomic transaction logic

### Sprint 4 (1 week)
- [ ] Update `/castlist` command to use virtual adapter
- [ ] Update `show_castlist2` to use virtual adapter
- [ ] Update Production Menu buttons

### Sprint 5 (1 week)
- [ ] Remove user restrictions
- [ ] Add deprecation notices
- [ ] Monitor legacy usage

### Sprint 6 (Future)
- [ ] Remove prod_manage_tribes
- [ ] Clean up legacy code
- [ ] Final documentation

## 🎯 Definition of Done

The legacy system can be retired when:

1. ✅ All castlist display methods use virtual adapter
2. ✅ Manual ordering works for custom castlists
3. ✅ Swap/merge handles tribe transitions
4. ✅ All 6 sort strategies functional
5. ✅ New castlist creation available in Hub
6. ✅ Zero user restrictions on CastlistV3 Hub
7. ✅ prod_manage_tribes usage at zero for 30 days
8. ✅ All legacy string matching removed
9. ✅ Full test coverage for migration scenarios
10. ✅ Documentation updated for new system

## 📝 Code Cleanup Checklist

Once legacy is retired, remove:

- [ ] prod_manage_tribes button and handler
- [ ] Legacy string matching in getGuildTribes()
- [ ] Direct playerData access in handlers
- [ ] Fallback logic for empty tribe fields
- [ ] Legacy tracking calls
- [ ] Backwards compatibility comments
- [ ] Virtual adapter (after full migration)

## 💡 Lessons Learned

From this migration effort:

1. **Virtual Adapter Pattern Works**: Allows gradual migration without breaking changes
2. **Dual Storage is Safe**: Keeping both fields prevents data loss
3. **Early Materialization is Better**: Convert at selection, not at usage
4. **Default Needs Special Care**: Most important castlist requires extra attention
5. **Test with Production Data**: Edge cases only appear with real usage

## 🔗 Related Documentation

- **Current State**: [docs/features/CastlistV3.md](../features/CastlistV3.md)
- **Architecture**: [docs/architecture/CastlistArchitecture.md](../architecture/CastlistArchitecture.md)
- **Feature Status**: [docs/features/CastlistV3-FeatureStatus.md](../features/CastlistV3-FeatureStatus.md)
- **Data Structures**: [docs/features/CastlistV3-DataStructures.md](../features/CastlistV3-DataStructures.md)

---

**Last Updated**: November 2025 - Post default castlist bug fixes
**Next Review**: December 2025 - Assess Sprint 1 completion