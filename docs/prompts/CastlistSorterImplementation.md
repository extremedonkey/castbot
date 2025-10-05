# Castlist Sorter Implementation - Zero-Context Primer

## 🎯 Task Overview

Implement additional sort strategies for the castlist display system. The sorting infrastructure exists but only 2 of 6+ strategies are implemented.

---

## 📂 Key Files to Review

### Primary Implementation
- **`castlistSorter.js`** (103 lines) - Main sorting module with extensible strategy pattern
- **`castlistV2.js`** - Display engine that calls the sorter
- **`docs/features/CastlistV3.md`** (lines 78, 148-160) - Architecture specification
- **`docs/features/CastlistV3-FeatureStatus.md`** - Current implementation status

### Context & Data Structures
- **`000-editCastlistSeason.md`** - Complete data structure reference for castlists, tribes, placements
- **`docs/features/CastlistNavigationParsing.md`** - Button parsing and identifier resolution (if touching navigation)

---

## 🏗️ Current Architecture

### Data Structure (from 000-editCastlistSeason.md)
```javascript
// Castlist entity
castlistConfigs: {
  "castlist_123": {
    id: "castlist_123",
    name: "Season 47 Alumni",
    type: "alumni_placements",
    seasonId: "season_abc",  // Links to season
    settings: {
      sortStrategy: "placements",  // ← THIS determines sort behavior
      showRankings: true,
      maxDisplay: 25
    }
  }
}

// Tribe references castlist
tribes: {
  "roleId_456": {
    castlist: "Season 47 Alumni",      // Legacy name
    castlistId: "castlist_123",         // New ID (authoritative)
    castlistIds: ["castlist_123", ...], // Multi-castlist support
    customSort: "age"  // Optional tribe-specific override
  }
}

// Player data for sorting
players: {
  "userId_789": {
    age: 28,
    pronouns: "She/Her",
    timezone: "PST"
  }
}

// Placements (namespace varies by season)
placements: {
  global: { "userId_789": { placement: 3 } },
  "season_abc": { "userId_789": { placement: 1 } }
}
```

### Current Sorter Implementation (castlistSorter.js)
```javascript
export function sortCastlistMembers(members, tribeData, options = {}) {
  const sortingStrategy = tribeData.type || 'default';  // ⚠️ Uses tribe.type NOT castlist.settings.sortStrategy

  switch (sortingStrategy) {
    case 'alumni_placements':
      return sortByPlacements(members, tribeData.rankings || {});
    case 'default':
    default:
      return sortAlphabetical(members);
  }
}
```

**Functions implemented**:
- ✅ `sortAlphabetical(members, reverse)` - A-Z or Z-A sorting
- ✅ `sortByPlacements(members, rankings)` - Sort by placement numbers (1st, 2nd, 3rd...)

**Functions stubbed (lines 99-103)**:
- ❌ `sortByAge()` - Not implemented
- ❌ `sortByTimezone()` - Not implemented
- ❌ `sortByJoinDate()` - Not implemented
- ❌ `sortCustomOrder()` - Not implemented (manual drag-drop ordering)

---

## 🎯 Intended Architecture (from CastlistV3.md:148-160)

```javascript
export function sortCastlistMembers(members, castlist, tribe) {
  // Priority: tribe-specific override > castlist settings > default
  const strategy = tribe.customSort || castlist.settings.sortStrategy;

  switch (strategy) {
    case 'placements':      // ✅ Implemented
    case 'alphabetical':    // ✅ Implemented
    case 'reverse_alpha':   // ❌ Not implemented (but sortAlphabetical supports it)
    case 'age':             // ❌ Not implemented
    case 'timezone':        // ❌ Not implemented
    case 'join_date':       // ❌ Not implemented
    case 'activity':        // ❌ Not implemented (future feature)
    case 'custom':          // ❌ Not implemented (manual ordering)
  }
}
```

---

## 🔑 Key Implementation Details

### 1. Placement Sorting (Current - Working Example)
**How it works** (castlistSorter.js:49-82):
- Separates members into ranked vs unranked
- Adds `member.placement` and `member.displayPrefix` properties
- Ranked members sorted numerically (1, 2, 3...)
- Unranked members sorted alphabetically
- Returns: `[...ranked, ...unranked]`

**Data source**:
- Placements come from `placements[namespace][userId]`
- Namespace determined by `castlist.seasonId` (see castlistV2.js:340-349)
- If no `seasonId`: uses `placements.global`
- If `seasonId` exists: uses `placements[seasonId]`

### 2. Member Object Structure
**Discord.js Member Object** (what you're sorting):
```javascript
{
  user: {
    id: "391415444084490240",
    username: "extremedonkey",
    displayName: "Reece"
  },
  displayName: "ReeceBot",  // Nickname or display name
  nickname: "ReeceBot",
  joinedAt: Date,
  // Plus properties added by sorter:
  placement: 3,           // Added by sortByPlacements()
  displayPrefix: "3) "    // Added by sortByPlacements()
}
```

### 3. Player Profile Data Access
**Location**: `playerData[guildId].players[userId]`

**Available fields** (from player profiles):
```javascript
{
  age: 28,
  pronouns: "She/Her",
  timezone: "PST",
  timezoneRaw: "America/Los_Angeles",
  // Plus member.joinedAt from Discord.js
}
```

---

## 🚨 Critical Implementation Notes

### Data Loading Pattern (from castlistV2.js:332-349)
```javascript
// Sorter is called from SYNC function, must NOT use async/await
// If you need playerData, it must be pre-loaded and passed as parameter

// CURRENT (broken for new strategies):
function createTribeSection(tribe, ...) {
  // This is SYNC
  const sortedMembers = sortCastlistMembers(members, tribe);
}

// REQUIRED FOR AGE/TIMEZONE SORTING:
// Pre-load playerData and pass it through
const playerData = await loadPlayerData();  // In async caller
sortCastlistMembers(members, tribe, { playerData, guildId });
```

### Namespace for Placements (CRITICAL)
**Bug we just fixed**: Navigation handler must attach `castlistSettings` to tribes so placement namespace is consistent.

```javascript
// In app.js when building tribes:
tribe.castlistSettings = {
  ...castlistEntity?.settings,
  seasonId: castlistEntity?.seasonId  // ← Determines placement namespace
};
```

---

## 📋 Implementation Checklist

### For Each New Sort Strategy:

1. **Add case to switch statement** in `sortCastlistMembers()`
2. **Implement sort function** following `sortByPlacements()` pattern
3. **Handle data access**:
   - If needs player data: Pre-load and pass via options
   - If needs placements: Access via `options.placements[namespace]`
4. **Preserve member object structure** (Discord.js objects)
5. **Return sorted array** (mutating in-place is OK, or return new array)

### Example: sortByAge() Implementation Template
```javascript
function sortByAge(members, options = {}) {
  const { playerData, guildId } = options;
  if (!playerData || !guildId) return sortAlphabetical(members);

  return members.sort((a, b) => {
    const ageA = playerData[guildId]?.players?.[a.user.id]?.age || 999;
    const ageB = playerData[guildId]?.players?.[b.user.id]?.age || 999;
    return ageA - ageB;  // Youngest first
  });
}
```

---

## 🧪 Testing Approach

1. **Read existing implementation** (`sortByPlacements()`) to understand patterns
2. **Check where sorter is called** (search for `sortCastlistMembers` in codebase)
3. **Determine if calling context has playerData** available
4. **If NOT available**: Update caller to pre-load and pass it
5. **Implement new strategy** following existing patterns
6. **Test with**:
   - View mode: `/menu` → Castlist button
   - Edit mode: `/menu` → Production → Edit castlist
   - Navigation: Click through pages to ensure consistency

---

## 🔗 Related Systems

### If modifying how castlist entities are used:
- **CastlistNavigationParsing.md** - Button ID formats and identifier resolution
- **RaP/0992** - Recent navigation fixes (identifier resolution, namespace consistency)

### If adding UI for sort strategy selection:
- **castlistHub.js** - Management hub UI (has "Order" button placeholder)
- **castlistHandlers.js** - Button handlers for castlist management

---

## 💡 Quick Start Commands

```bash
# Find all calls to the sorter
grep -n "sortCastlistMembers" /home/reece/castbot/*.js

# Check current implementation
cat /home/reece/castbot/castlistSorter.js

# See architecture spec
grep -A20 "sortStrategy" /home/reece/castbot/docs/features/CastlistV3.md

# Test in dev
./scripts/dev/dev-restart.sh "Implement age/timezone sorting"
tail -f /tmp/castbot-dev.log
```

---

## 🎯 Likely First Task

**Implement the missing 4 sort strategies** (2-3 hours):

1. ✅ `reverse_alpha` - Easy, just call `sortAlphabetical(members, true)`
2. 🟡 `age` - Medium, needs playerData pre-loaded
3. 🟡 `timezone` - Medium, needs playerData + timezone parsing
4. 🟡 `join_date` - Easy, uses `member.joinedAt` from Discord.js
5. 🔴 `custom` - Hard, needs manual ordering UI (separate task)

**Difficulty**: The challenge is NOT implementing the sort functions (trivial), but updating the CALLER to pre-load and pass playerData through the sync call chain.

---

**Good luck!** 🚀
