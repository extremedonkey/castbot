# Castlist V3: Alumni Season Placements (MVP)

## Overview

**Status**: MVP Implementation (Functional but not production-ready)  
**Created**: January 24, 2025  
**Purpose**: Enable hosts to display player rankings/placements in castlists for past seasons

This document describes the initial MVP implementation of a new castlist type that displays player placements (1st, 2nd, 3rd, etc.) for alumni seasons. This is the first step toward a more comprehensive castlist ordering system.

## 🎯 Feature Requirements

### User Story
As a production team member, I want to create special castlists that show player placements from past seasons, so viewers can immediately see who won, who came second, third, etc.

### Current Implementation Scope (MVP)
- ✅ New castlist type: `alumni_placements`
- ✅ Manual entry of top 3 placements via modal (1st, 2nd, 3rd)
- ✅ Display players with rank prefixes (e.g., "1) Morgane")
- ✅ Maintain backwards compatibility with existing castlists
- ✅ Rankings persist in playerData.json

### Future Scope (Not Yet Implemented)
- ❌ Entity framework for managing all placements
- ❌ Bulk import from existing roles
- ❌ Support for all placement positions (4th, 5th, etc.)
- ❌ Alternative sorting methods (by age, timezone, etc.)
- ❌ UI for reordering/editing placements

## 📁 Technical Implementation

### Files Modified/Created

1. **`/castlistSorter.js`** (NEW)
   - Central sorting module for all castlist ordering logic
   - Extensible design for future sorting strategies
   - Handles both alumni placements and default alphabetical

2. **`/app.js`** (MODIFIED)
   - Lines 24601-24606: Added "Alumni Season Placements" option to select menu
   - Lines 24748-24800: Added placement ID input fields to modal
   - Lines 26856-26883: Extract and save rankings data
   - Lines 1143-1153: Apply sorting in "ideal" scenario

3. **`/castlistV2.js`** (MODIFIED)
   - Line 14: Import sortCastlistMembers
   - Lines 72-73: Apply sorting in calculateTribePages
   - Lines 186-192: Display placement prefixes

4. **`/storage.js`** (MODIFIED)
   - Lines 156-166: Include ALL tribe fields (type, rankings, etc.) using spread operator

5. **`/playerData.json`** (DATA STRUCTURE)
   ```json
   "tribes": {
     "1409191262279700622": {
       "emoji": "🏆",
       "castlist": "LOSTvivor Alumni",
       "type": "alumni_placements",
       "rankings": {
         "977455730300956683": { "placement": "1" },
         "572291395365109770": { "placement": "2" },
         "391415444084490240": { "placement": "3" }
       }
     }
   }
   ```

## 🔧 How It Works

### 1. Creation Flow
```
Production Menu → Add Tribe → Select Role → Choose "Alumni Season Placements"
→ Modal appears with:
   - Tribe Emoji (optional)
   - 3rd Place ID field
   - 2nd Place ID field  
   - 1st Place ID field
→ Saves to playerData.json with type="alumni_placements"
```

### 2. Display Flow
```
User views castlist → System loads tribes → Detects type="alumni_placements"
→ sortCastlistMembers() called → sortByPlacements() applies rankings
→ Ranked players shown first with "1) ", "2) ", "3) " prefixes
→ Unranked players shown after in alphabetical order
```

### 3. Sorting Logic (`castlistSorter.js`)
```javascript
// Main entry point
export function sortCastlistMembers(members, tribeData, options = {}) {
  const sortingStrategy = tribeData.type || 'default';
  
  switch (sortingStrategy) {
    case 'alumni_placements':
      return sortByPlacements(members, tribeData.rankings || {});
    case 'default':
    default:
      return sortAlphabetical(members);
  }
}
```

## 🐛 Issues Encountered & Resolved

### Issue 1: Tribe Data Not Including New Fields
**Problem**: `getGuildTribes()` was only returning specific fields, excluding `type` and `rankings`  
**Solution**: Modified storage.js to use spread operator: `{ roleId, ...tribeData }`

### Issue 2: Sorting Only Applied to Multi-Page Tribes
**Problem**: "Ideal" scenario (≤8 members) bypassed sorting entirely  
**Solution**: Added sorting to ideal scenario path in app.js (lines 1143-1153)

### Issue 3: Redundant Alphabetical Sort Override
**Problem**: Extra sort at line 1180 was overriding custom sorting  
**Solution**: Removed redundant sort, members already sorted by appropriate method

### Issue 4: Discord.js Object Structure Lost
**Problem**: Using spread operator broke member.roles.cache access  
**Solution**: Preserve original member objects, add properties directly:
```javascript
// ❌ WRONG - Breaks Discord.js objects
ranked.push({ ...member, placement: 1 });

// ✅ CORRECT - Preserves object structure
member.placement = 1;
member.displayPrefix = "1) ";
ranked.push(member);
```

## ⚠️ Current Limitations (MVP)

1. **Manual Entry Only**: Must enter Discord user IDs manually
2. **Top 3 Only**: Modal limited to 5 text inputs (Discord limit)
3. **No Bulk Operations**: Can't import from existing roles
4. **No Edit UI**: Must use raw data editing to modify rankings
5. **Basic Validation**: No verification of user IDs
6. **Single Ranking Type**: Only supports placement numbers

## 🚀 Future Improvements

### Phase 1: Enhanced Data Entry
- Entity framework integration for managing all placements
- User select menus instead of manual ID entry
- Bulk import from role members
- Validation of user IDs

### Phase 2: Extended Sorting Options
```javascript
// Future sorting strategies in castlistSorter.js
case 'alphabetical_reverse': // Z to A
case 'by_age':              // Sort by age field
case 'by_timezone':         // Sort by timezone offset
case 'by_join_date':        // Sort by server join date
case 'custom_order':        // Manual drag-and-drop ordering
```

### Phase 3: Advanced Features
- Visual ranking editor with drag-and-drop
- Multiple ranking systems per castlist
- Conditional display (show ranks only in certain channels)
- Export/import ranking data
- Ranking history tracking

## 🔄 Backwards Compatibility

The implementation maintains 100% backwards compatibility:

1. **Default Behavior Unchanged**: Castlists without `type` field continue using alphabetical sort
2. **Data Structure Additive**: New fields (`type`, `rankings`) are optional and ignored by legacy code
3. **No Breaking Changes**: All existing castlists continue to function identically
4. **Gradual Migration**: Can convert castlists to new types one at a time

## 📊 Testing Checklist

- [x] Create alumni placement castlist via Production Menu
- [x] Enter placements for 3 users
- [x] Verify ranked users appear first with number prefixes
- [x] Verify unranked users appear after in alphabetical order
- [x] Test with 0, 1, 2, and 3 ranked users
- [x] Verify default castlists still work alphabetically
- [x] Test pagination with >8 members
- [ ] Test with invalid user IDs
- [ ] Test with duplicate placements

## 🎓 Key Learnings

1. **Discord.js Object Integrity**: Never use spread operator on Discord.js objects - they have complex prototype chains that don't survive spreading

2. **Multiple Code Paths**: Sorting must be applied in ALL display scenarios (ideal, multi-page, etc.)

3. **Data Loading Completeness**: Storage functions should return ALL data fields for extensibility

4. **MVP Approach**: Start with minimal viable feature, maintain backwards compatibility, iterate based on usage

## 📝 Code References

### Quick Command Reference
```bash
# Find sorting implementation
grep -n "sortCastlistMembers" castlistV2.js

# Check tribe data structure  
grep -n "alumni_placements" playerData.json

# View modal creation
grep -n "Alumni Season Placements" app.js
```

### Key Functions
- `sortCastlistMembers()` - castlistSorter.js:15
- `sortByPlacements()` - castlistSorter.js:49
- `calculateTribePages()` - castlistV2.js:71
- `createPlayerCard()` - castlistV2.js:184
- `getGuildTribes()` - storage.js:152

## 🤝 Contributing

When extending this feature:

1. **Maintain Backwards Compatibility**: Never break existing castlists
2. **Use Extensible Patterns**: Add new sort strategies to switch statement
3. **Preserve Object Structure**: Don't spread Discord.js objects
4. **Test All Scenarios**: ideal, multi-page, empty tribes
5. **Document Changes**: Update this file with new capabilities

## 📚 Related Documentation

- [ComponentsV2.md](../architecture/ComponentsV2.md) - Discord UI architecture
- [ButtonHandlerFactory.md](../architecture/ButtonHandlerFactory.md) - Button implementation patterns
- [EntityEditFramework.md](../architecture/EntityEditFramework.md) - Future UI for managing rankings
- [storage.js](../../storage.js) - Data persistence layer

---

**Note**: This is an MVP implementation designed to prove the concept and maintain backwards compatibility while we develop a more comprehensive solution. The architecture is intentionally extensible to support future sorting strategies and management interfaces.