# Legacy Rankings System Removal

**Date:** October 5, 2025
**Status:** ✅ COMPLETED
**Impact:** Cleaned up legacy proof-of-concept placement system

## Overview

Removed the legacy `alumni_placements` tribe type and `tribe.rankings` data structure that was a proof-of-concept implementation. This system has been replaced by the centralized placement system that stores placements at the guild level, namespaced by season or globally.

## What Was Removed

### 1. UI Components
- **Alumni Season Placements** option from Add Tribe select menu
- Modal fields for entering 1st, 2nd, 3rd place IDs manually
- Success message formatting for alumni placements

### 2. Data Processing
- `selectedCastlist === 'alumni_placements'` conditionals
- `tribe.type = 'alumni_placements'` assignments
- `tribe.rankings = {}` data structure creation
- Season creation logic for alumni castlists

### 3. Data Structure (Deprecated)
```javascript
// LEGACY (DO NOT USE):
tribe: {
  type: 'alumni_placements',  // Removed
  rankings: {                  // Removed
    "userId": {
      placement: "1"
    }
  }
}
```

## Current System

Placements are now stored centrally and accessed via:

```javascript
// CURRENT:
playerData[guildId].placements = {
  global: {           // For "No Season" castlists
    "userId": {
      placement: 3,
      updatedBy: "adminId",
      updatedAt: "timestamp"
    }
  },
  "season_abc123": {  // For season-specific castlists
    "userId": {
      placement: 1,
      updatedBy: "adminId",
      updatedAt: "timestamp"
    }
  }
}
```

## Migration Note

Any existing tribes with `type: 'alumni_placements'` and `rankings` data will continue to exist in the data but are ignored by the sorting system. The centralized placement system should be used instead via:
- Production Menu → Castlist Management → Edit Info → Set Season
- Edit Mode → Placement buttons (`edit_placement_*`)

## Files Modified

1. **app.js**
   - Line 27250: Removed Alumni Placements select option
   - Lines 27392-27404: Removed alumni modal fields
   - Lines 29677-29717: Removed alumni processing logic
   - Lines 29731-29734: Cleaned up success message

2. **castlistSorter.js**
   - Line 88: Changed placement format from `1)` to `` `1` ``

## Testing

Verified that:
- ✅ Add Tribe menu no longer shows Alumni Placements option
- ✅ Placement sorting uses centralized system
- ✅ Placement numbers display as `` `1` `` instead of `1)`
- ✅ No references to `tribe.rankings` in active code

## Related Documentation

- [CastlistV3.md](../features/CastlistV3.md) - New placement system architecture
- [CastlistSorterImplementation.md](../prompts/CastlistSorterImplementation.md) - Sorting implementation details
- [RaP/0994](../../RaP/0994_20251005_CastlistSorting_Analysis.md) - Sorting system analysis