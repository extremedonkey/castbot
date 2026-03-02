# RaP-0998: Vanity Role Sort Display Order - Technical Design

**Date**: 2025-11-01
**Status**: Design Phase
**Risk Level**: Low
**Tech Debt Impact**: Minimal

---

## 🤔 Original Context / Trigger Prompt

User requested two enhancements to vanity role sorting:

1. **Add Emoji Sort Tier**: Roles starting with emojis (e.g., `@🏆Winners`) should sort AFTER Season/Sx, Alphabetical, and Numeric roles.

2. **Order Vanity Roles in Display**: When showing a player's vanity roles in the castlist card, display them in sorted order (Season → Alpha → Numeric → Emoji) instead of the current order (playerData.json insertion order).

**User's specific question**: "Does implementing #2 introduce any tech debt or high-risk tradeoffs, considering our transitional architectural state?"

---

## 🏛️ Current Architectural State

### Transitional Phase Analysis

From `CastlistArchitecture.md` and `CastlistArchitectureAnalysis.md`:

**We are in Phase 1 of a 4-phase migration:**
- ✅ Virtual adapter exists but only used in Castlist Hub (restricted to one user)
- ❌ 4 of 5 access methods use legacy string matching
- ⚠️ `buildCastlist2ResponseData()` sits in app.js (should be in castlistV2.js)
- 📋 Immediate priority: Move display logic to proper layer

**Access Method Breakdown:**
| Method | Virtual Adapter | Location | Users Affected |
|--------|----------------|----------|----------------|
| `/castlist` Command | ❌ No | app.js → castlistV2.js | All users |
| `show_castlist2` Handler | ❌ No | app.js → castlistV2.js | All users |
| Castlist Hub | ✅ Yes | castlistHub.js | Restricted (1 user) |
| Post Castlist Button | ❌ No | app.js → castlistV2.js | All users |
| Production Menu | ❌ No | app.js | Admins only |

---

## 📊 Current Vanity Role Display Implementation

### Code Location: `castlistV2.js:205-233`

```javascript
// Add vanity roles if available
let vanityRolesInfo = '';
if (playerData?.vanityRoles && playerData.vanityRoles.length > 0) {
    const validVanityRoles = [];
    for (const roleId of playerData.vanityRoles) {
        try {
            // Try to find the role in the member's guild
            const role = member.guild.roles.cache.get(roleId);
            if (role) {
                // Use Discord role mention format <@&roleId>
                validVanityRoles.push(`<@&${roleId}>`);
            }
        } catch (error) {
            console.debug(`Skipping invalid vanity role ${roleId} for player ${member.id}`);
        }
    }

    if (validVanityRoles.length > 0) {
        vanityRolesInfo = validVanityRoles.join(' ');
    }
}
```

**Current Behavior:**
1. Vanity roles displayed in **array insertion order** from `playerData[guildId].players[userId].vanityRoles`
2. No sorting applied
3. Role mentions rendered as `<@&roleId>` (Discord auto-renders with @)

**Example Current Output:**
```
Brennan
He/Him
@S11 - Stephen King    ← Added second
@S2 - Big Bang         ← Added first
@S6 - Tarantino        ← Added third
```

---

## 🎯 Proposed Enhancement: Request #1 (Emoji Sort Tier)

### Implementation: Low Risk ✅

**Location**: `castlistSorter.js` - Extend existing `categorizeRoleName()` function

**Changes Required:**
```javascript
function categorizeRoleName(roleName) {
  if (!roleName) {
    return { category: 'other', value: '' };
  }

  // Check for season patterns first (highest priority)
  const seasonData = parseSeasonNumber(roleName);
  if (seasonData) {
    return { category: 'season', value: seasonData.number, original: roleName };
  }

  const firstChar = roleName.charAt(0);

  // Check if starts with a letter (a-z, case insensitive)
  if (/[a-z]/i.test(firstChar)) {
    return { category: 'alpha', value: roleName.toLowerCase(), original: roleName };
  }

  // Check if starts with a digit
  if (/\d/.test(firstChar)) {
    const numMatch = roleName.match(/^(\d+)/);
    const numValue = numMatch ? parseInt(numMatch[1]) : 0;
    return { category: 'numeric', value: numValue, original: roleName };
  }

  // NEW: Emoji detection (anything that's not alpha/numeric)
  // This catches: 🏆Winners, 😀Happy, etc.
  if (!/[a-z0-9]/i.test(firstChar)) {
    return { category: 'emoji', value: roleName, original: roleName };
  }

  // Everything else (shouldn't reach here)
  return { category: 'other', value: roleName, original: roleName };
}
```

**Update `sortByVanityRole()` function:**
```javascript
// Group members by vanity role category
const seasonRoles = [];
const alphaRoles = [];
const numericRoles = [];
const emojiRoles = [];  // NEW
const noVanityRoles = [];

// ... categorization logic ...

// Add to appropriate group
switch (firstAlphaRole.category) {
  case 'season':
    seasonRoles.push(member);
    break;
  case 'alpha':
    alphaRoles.push(member);
    break;
  case 'numeric':
    numericRoles.push(member);
    break;
  case 'emoji':  // NEW
    emojiRoles.push(member);
    break;
  default:
    noVanityRoles.push(member);
}

// Sort emoji roles alphabetically by role name
emojiRoles.sort((a, b) => a.vanitySortValue.localeCompare(b.vanitySortValue));

// Combine in priority order
return [...seasonRoles, ...alphaRoles, ...numericRoles, ...emojiRoles, ...noVanityRoles];
```

**Risk Assessment**: ✅ **LOW RISK**
- Simple extension to existing pattern
- No architectural changes
- Backward compatible (existing roles still sort correctly)
- Single file modification

---

## 🎯 Proposed Enhancement: Request #2 (Display Order)

### Three Implementation Options Analyzed

---

### ❌ Option A: Sort at Display Time (castlistV2.js)

**Approach**: Sort vanity role IDs before rendering in `createPlayerCard()`

```javascript
// In createPlayerCard() at castlistV2.js:205
if (playerData?.vanityRoles && playerData.vanityRoles.length > 0) {
    // Check if we should sort (only for vanity_role strategy)
    const shouldSort = tribeData?.castlistSettings?.sortStrategy === 'vanity_role';

    let roleIdsToDisplay = playerData.vanityRoles;

    if (shouldSort) {
        // Get role names and categorize
        const rolesWithNames = roleIdsToDisplay
            .map(roleId => {
                const role = member.guild.roles.cache.get(roleId);
                return role ? { id: roleId, name: role.name } : null;
            })
            .filter(r => r);

        // Sort using imported categorization logic
        const sorted = sortVanityRolesByCategory(rolesWithNames);
        roleIdsToDisplay = sorted.map(r => r.id);
    }

    // Render in order
    const validVanityRoles = [];
    for (const roleId of roleIdsToDisplay) {
        // ... existing rendering logic ...
    }
}
```

**Pros:**
- ✅ Pure display logic - no data mutation
- ✅ Only affects castlists with `sortStrategy: 'vanity_role'`
- ✅ Easy to toggle/remove

**Cons:**
- ❌ Duplicates categorization logic (need to import from castlistSorter)
- ❌ Adds O(n log n) processing to every player card render
- ❌ Logic split between sorting (castlistSorter) and display (castlistV2)
- ❌ Violates DRY principle

**Tech Debt**: **MEDIUM** - Creates coupling between layers

---

### ✅ Option B: Utility Function (Recommended)

**Approach**: Create reusable utility in `castlistSorter.js` called from display layer

```javascript
// NEW FUNCTION in castlistSorter.js
/**
 * Sort vanity role IDs by category priority
 * @param {Array<{id: string, name: string}>} roles - Array of role objects with id and name
 * @returns {Array<{id: string, name: string}>} Sorted role objects
 */
export function sortVanityRolesForDisplay(roles) {
    // Categorize all roles
    const categorized = roles.map(role => ({
        ...role,
        category: categorizeRoleName(role.name)
    }));

    // Group by category
    const groups = {
        season: [],
        alpha: [],
        numeric: [],
        emoji: [],
        other: []
    };

    categorized.forEach(role => {
        const cat = role.category.category;
        if (groups[cat]) {
            groups[cat].push(role);
        } else {
            groups.other.push(role);
        }
    });

    // Sort each group
    groups.season.sort((a, b) => a.category.value - b.category.value);
    groups.alpha.sort((a, b) => a.category.value.localeCompare(b.category.value));
    groups.numeric.sort((a, b) => a.category.value - b.category.value);
    groups.emoji.sort((a, b) => a.category.value.localeCompare(b.category.value));
    groups.other.sort((a, b) => a.name.localeCompare(b.name));

    // Combine in priority order
    return [
        ...groups.season,
        ...groups.alpha,
        ...groups.numeric,
        ...groups.emoji,
        ...groups.other
    ];
}
```

**Usage in castlistV2.js:**
```javascript
// Import at top of file
import { sortVanityRolesForDisplay } from './castlistSorter.js';

// In createPlayerCard() at line 205
if (playerData?.vanityRoles && playerData.vanityRoles.length > 0) {
    const shouldSort = tribeData?.castlistSettings?.sortStrategy === 'vanity_role';

    // Fetch all role names upfront
    const rolesWithNames = playerData.vanityRoles
        .map(roleId => {
            const role = member.guild.roles.cache.get(roleId);
            return role ? { id: roleId, name: role.name } : null;
        })
        .filter(r => r);

    // Sort if vanity_role strategy
    const orderedRoles = shouldSort
        ? sortVanityRolesForDisplay(rolesWithNames)
        : rolesWithNames;

    // Render
    const validVanityRoles = orderedRoles.map(r => `<@&${r.id}>`);
    vanityRolesInfo = validVanityRoles.join(' ');
}
```

**Pros:**
- ✅ Reusable across different contexts
- ✅ Single source of truth for categorization
- ✅ Display layer can choose when to use it
- ✅ Easy to unit test independently
- ✅ No member object mutation
- ✅ When `buildCastlist2ResponseData()` moves, utility moves with it
- ✅ Follows Unix philosophy (small, composable functions)

**Cons:**
- ⚠️ Still adds processing at display time (but only when needed)
- ⚠️ Requires import from castlistSorter

**Tech Debt**: **LOW** ✅ - Clean separation, minimal coupling

---

### ❌ Option C: Sort During Member Sorting (castlistSorter.js)

**Approach**: Attach sorted vanity roles to member object during `sortByVanityRole()`

```javascript
// In sortByVanityRole() function
members.forEach(member => {
    const userId = member.user?.id || member.id;
    const vanityRoles = playerData[guildId]?.players?.[userId]?.vanityRoles || [];

    if (vanityRoles.length > 0) {
        // NEW: Sort and attach to member
        const rolesWithNames = vanityRoles
            .map(id => ({ id, name: member.guild?.roles?.cache?.get(id)?.name }))
            .filter(r => r.name);

        const sorted = sortVanityRolesForDisplay(rolesWithNames);
        member.sortedVanityRoleIds = sorted.map(r => r.id);  // MUTATION
    }
});
```

**Pros:**
- ✅ All sorting logic in one place
- ✅ Display layer stays simple
- ✅ Processing happens once (not per render)

**Cons:**
- ❌ Mutates Discord.js member objects (risky)
- ❌ Tightly couples sorting to display
- ❌ Only works when `sortStrategy === 'vanity_role'`
- ❌ Non-vanity-sorted castlists wouldn't get sorted vanity display
- ❌ Violates separation of concerns

**Tech Debt**: **HIGH** ❌ - Object mutation, tight coupling

---

## ⚖️ Architectural Risk Analysis

### Tech Debt Assessment

| Risk Factor | Option A | Option B (✅) | Option C |
|------------|----------|---------------|----------|
| Code Duplication | Medium | Low | Low |
| Performance Impact | Medium | Low | Low |
| Coupling | Medium | Low | High |
| Mutation Risk | None | None | High |
| Testability | Medium | High | Medium |
| Maintainability | Medium | High | Low |
| Migration Risk | Low | Low | Medium |
| **Overall** | **Medium** | **✅ Low** | **High** |

---

### Transitional Architecture Compatibility

**Question**: Does this introduce risk during the architectural migration?

**Answer**: ✅ **NO - Option B is migration-safe**

**Reasoning:**

1. **Location Stability**:
   - `castlistV2.js` is the correct long-term home for display logic
   - `castlistSorter.js` is the correct home for sorting utilities
   - No movement needed during Phase 2-4 migrations

2. **Virtual Adapter Independence**:
   - Vanity role display is orthogonal to virtual adapter migration
   - Works identically across all 5 access methods
   - No dependency on `castlistConfigs` vs legacy string data

3. **Module Boundaries**:
   - Utility function respects clean separation of concerns
   - Display layer (`castlistV2.js`) imports from data layer (`castlistSorter.js`)
   - This is the CORRECT dependency direction

4. **Backward Compatibility**:
   - Only activates when `sortStrategy === 'vanity_role'`
   - Existing castlists unaffected
   - No breaking changes to data structures

5. **Future-Proof**:
   - When `buildCastlist2ResponseData()` moves to `castlistV2.js` (Phase 2):
     - ✅ Utility function comes along automatically
     - ✅ Import path remains valid
     - ✅ No refactoring needed

---

### High-Risk Tradeoff Analysis

**Potential Risks Identified:**

1. **⚠️ User Expectation Changes**
   - **Risk**: Users accustomed to insertion-order display
   - **Mitigation**: Only affects `vanity_role` sort strategy (new feature)
   - **Impact**: Low - new behavior for new feature

2. **⚠️ Performance Degradation**
   - **Risk**: Sorting adds O(n log n) per player card
   - **Analysis**:
     - Typical case: 3-5 vanity roles per player
     - 50 players × 5 roles × log(5) ≈ 400 comparisons
     - Modern CPU: <1ms total
   - **Impact**: Negligible

3. **⚠️ Display Layer Awareness of Sort Strategy**
   - **Risk**: Display layer checks `tribeData.castlistSettings.sortStrategy`
   - **Analysis**: This is acceptable coupling - display adapts to data
   - **Impact**: Low - follows React/Vue pattern (props → rendering)

4. **⚠️ Conditional Logic Complexity**
   - **Risk**: `if (sortStrategy === 'vanity_role')` adds branching
   - **Mitigation**: Single conditional, well-documented
   - **Impact**: Very Low

**Verdict**: ✅ **No High-Risk Tradeoffs**

---

## 📋 Recommended Implementation Plan

### Phase 1: Add Emoji Sort Tier (30 minutes)

**File**: `castlistSorter.js`

1. Update `categorizeRoleName()` to detect emoji-prefixed roles
2. Add `emojiRoles` array in `sortByVanityRole()`
3. Sort emoji roles alphabetically
4. Insert into return array: `[...season, ...alpha, ...numeric, ...emoji, ...noVanity]`

**Testing**:
- Create role `🏆Winners` - should sort after `S1 - Test`
- Create role `😀Happy` - should sort after `A - Test`

---

### Phase 2: Create Utility Function (45 minutes)

**File**: `castlistSorter.js`

1. Export new function `sortVanityRolesForDisplay(roles)`
2. Reuse `categorizeRoleName()` logic internally
3. Return sorted array of `{id, name}` objects
4. Add JSDoc documentation

**Testing**:
- Unit test with mixed role array: `['🏆Winners', 'S2 - Test', 'A - Alpha', '1 - Numeric']`
- Expected order: `['S2 - Test', 'A - Alpha', '1 - Numeric', '🏆Winners']`

---

### Phase 3: Integrate into Display Layer (30 minutes)

**File**: `castlistV2.js`

1. Import `sortVanityRolesForDisplay` at top
2. In `createPlayerCard()` at line ~205:
   - Check `tribeData?.castlistSettings?.sortStrategy === 'vanity_role'`
   - Fetch role names upfront (avoid repeated lookups)
   - Call utility function if conditional true
   - Render sorted roles

**Testing**:
- Create castlist with `sortStrategy: 'vanity_role'`
- Assign player multiple vanity roles in random order
- Verify displayed in sorted order: Season → Alpha → Numeric → Emoji

---

### Phase 4: Documentation & Logging (15 minutes)

1. Update `CastlistV3.md` with new behavior
2. Add console.log when sorting vanity roles:
   ```javascript
   console.log(`[VANITY] Sorted ${roles.length} vanity roles for display (${sortedOrder})`);
   ```
3. Update BACKLOG.md to mark feature complete

---

## 🎯 Success Criteria

**Functional:**
- ✅ Roles starting with emoji sort after numeric roles
- ✅ Vanity roles display in sorted order when `sortStrategy === 'vanity_role'`
- ✅ Non-vanity-sorted castlists unaffected
- ✅ All 5 access methods work identically

**Performance:**
- ✅ No noticeable delay in castlist rendering
- ✅ Sorting completes in <5ms per player

**Maintainability:**
- ✅ Single utility function, easy to test
- ✅ No code duplication
- ✅ Clear separation of concerns

**Migration-Safe:**
- ✅ No refactoring needed during Phase 2-4
- ✅ Works with all access methods
- ✅ Virtual adapter independent

---

## 📊 Final Recommendation

**Answer to User's Question**:

> "Does implementing request #2 introduce any tech debt or high-risk tradeoffs?"

✅ **NO - Using Option B (Utility Function) introduces MINIMAL tech debt and ZERO high-risk tradeoffs.**

**Reasons:**

1. **Architectural Alignment**: ✅
   - Places logic in correct layers (sorting in sorter, display in display)
   - No violation of separation of concerns
   - Migration-safe during Phase 2-4 transitions

2. **Tech Debt**: ✅ **LOW**
   - Single source of truth (no duplication)
   - Reusable utility (follows DRY)
   - No object mutation
   - Clean imports (proper dependency direction)

3. **Risk Level**: ✅ **LOW**
   - Backward compatible (feature-flagged by sort strategy)
   - Performance negligible (microsecond-level sorting)
   - No breaking changes
   - Easy to test and verify

4. **Future-Proof**: ✅
   - Survives `buildCastlist2ResponseData()` relocation
   - Works across all 5 access methods
   - Independent of virtual adapter migration
   - No refactoring needed later

**Proceed with confidence!** 🚀

---

## 🔮 Alternative Considerations

**Q: Should we also sort vanity roles for non-vanity-sorted castlists?**

A: Not initially. Reasons:
- Users of alphabetical/placements sorts may expect insertion order
- Adds complexity without clear user benefit
- Can be added later as opt-in feature if requested

**Q: Should we cache sorted vanity roles?**

A: No. Reasons:
- Vanity roles rarely change during a session
- Sorting is O(n log n) where n is typically 3-5 (negligible)
- Caching adds complexity for minimal gain
- Request-scoped caching already exists for player data

**Q: Should sorting apply to ALL castlists regardless of sort strategy?**

A: Future enhancement. Initial scope: only `vanity_role` strategy.
- Less risk of unexpected UX changes
- Clear feature boundary
- Can expand based on user feedback

---

## 📝 Summary

**Request #1 (Emoji Tier)**: ✅ Low Risk, Simple Extension
**Request #2 (Display Order)**: ✅ Low Tech Debt, Migration-Safe

**Recommended Approach**: Option B (Utility Function)

**Total Implementation Time**: ~2 hours
**Files Modified**: 2 (castlistSorter.js, castlistV2.js)
**Lines of Code**: ~80 new, ~20 modified
**Breaking Changes**: 0
**Migration Risk**: None

**Verdict**: ✅ **PROCEED - This is a clean, low-risk enhancement!**
