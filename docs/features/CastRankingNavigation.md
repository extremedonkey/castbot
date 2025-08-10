# Cast Ranking Navigation System

**Version:** 1.0  
**Status:** ✅ Production Ready  
**Created:** January 2025  
**Dependencies:** Cast Ranking System, Components V2, Button Handler Factory

## Overview

The Cast Ranking Navigation System provides efficient navigation through large numbers of applicants via a String Select dropdown menu. This feature was developed to address user complaints about navigating through 40+ applications using only Previous/Next buttons.

## Problem Statement

Users with many applications (e.g., 42 in the reported case) found it tedious to navigate using only Previous/Next buttons. The linear navigation required excessive clicking to move between distant applicants.

## Solution

A String Select component that allows direct jumping to any applicant, with automatic pagination for seasons with 25+ applicants (Discord's String Select limit).

## Architecture

### Core Components

#### 1. `createApplicantSelectOptions()` Function
**Location:** `app.js:550-637`  
**Purpose:** Generates select menu options with smart formatting and pagination

**Features:**
- Icon-based visual status indicators
- Automatic text truncation for 100-char Discord limit
- Pagination support (24 items per page)
- Notes indicator (💬)

**Function Signature:**
```javascript
function createApplicantSelectOptions(allApplications, playerData, guildId, currentPage = 0)
```

**Parameters:**
- `allApplications` - Array of all season applications
- `playerData` - Full player data object for rankings/status
- `guildId` - Discord guild ID
- `currentPage` - Current page of options (0-based)

**Returns:** Array of Discord select menu options

### Icon Priority System

Icons are displayed based on the following precedence (highest to lowest):

1. **🎬** - `castingStatus === 'cast'` (Player cast)
2. **🗑️** - `castingStatus === 'reject'` (Player rejected)
3. **☑️** - 2+ votes and no cast/reject status (Some votes)
4. **🗳️** - <2 votes and no cast/reject status (Not enough votes)

Note: `tentative` status is intentionally ignored as it's not useful for quick navigation.

### Option Format

Each option displays as:
```
[Icon] [Position]. [DisplayName] ([Username]) - [VoteCount] vote(s) [NotesIndicator]
```

Example:
- `🎬 1. John Doe (johndoe) - 5 votes 💬`
- `🗑️ 14. Peri (sfxperi) - 5 votes 💬`
- `🗳️ 43. Lewis (xlewisthorpx) - 1 vote 💬`

### Pagination System

When there are 25+ applicants:
- Shows 24 applicants per "page"
- 25th option becomes navigation: `▶ Show Applications 25-49`
- Previous page option appears when not on first page: `◀ Show Applications 1-24`

**Page Navigation Behavior:**
- Selecting a page option shows the first applicant of that page
- Direct applicant selection maintains the current page
- Page state is encoded in custom_id: `ranking_select_{appIndex}_{configId}_{page}`

## Implementation Details

### Integration Points

The String Select is added in four key locations:

1. **Main season_app_ranking handler** (`app.js:7957-7970`)
2. **Rank button handlers** (`app.js:5069-5082`)  
3. **Navigation handlers** (`app.js:5340-5353`)
4. **Casting status handlers** (`app.js:5600-5613`)

### String Select Component Structure

```javascript
{
  type: 1, // Action Row
  components: [{
    type: 3, // String Select
    custom_id: `ranking_select_${appIndex}_${configId || 'legacy'}_${currentPage}`,
    placeholder: '🔍 Jump to applicant...',
    options: selectOptions,
    min_values: 1,
    max_values: 1
  }]
}
```

### Handler Implementation

**Location:** `app.js:5459-5884`  
**Handler ID:** `ranking_select`

**Key Logic:**
1. Parse custom_id to extract current index, configId, and page
2. Check if selected value is page navigation (`page_X`) or applicant index
3. For page navigation: Show first applicant of new page
4. For applicant selection: Jump directly to selected applicant
5. Regenerate full interface with correct state

**State Preservation:**
- Current page maintained when jumping between applicants
- Previous/Next buttons update correctly based on new position
- All rankings, notes, and casting status preserved

## Text Truncation Logic

To respect Discord's 100-character limit for select option labels:

1. Calculate fixed parts length (icon, position, vote count, notes indicator)
2. Determine available space for username
3. If label exceeds 100 chars:
   - First attempt: Truncate username only
   - If still too long: Truncate both displayName and username equally

## Conditional Display

The String Select is only shown when:
- There are 2+ applications in the season
- User has appropriate permissions (Manage Roles/Channels)

Hidden for single-applicant seasons to avoid UI clutter.

## Data Flow

```
User selects option → Handler parses selection
    ↓
Page navigation? → Yes → Show first applicant of new page
    ↓ No             ↓
Jump to applicant → Regenerate interface with new applicant
    ↓                ↓
Update select menu page state
    ↓
Send UPDATE_MESSAGE response
```

## Testing Considerations

### Edge Cases
1. **Exactly 25 applicants:** Should show 24 + "Show Applications 25-25"
2. **Single applicant:** String Select should not appear
3. **Long names:** Truncation should maintain readability
4. **Missing data:** Handle missing displayName/username gracefully
5. **Permission denied:** Appropriate error messages

### Performance
- Helper function is called on every interface generation
- Minimal performance impact even with 100+ applicants
- Page state prevents unnecessary full list processing

## Common Issues & Solutions

### "This interaction failed" Errors
- Ensure Components V2 flag is set
- Verify custom_id parsing handles configIds with underscores
- Check that select options array is properly formatted

### Navigation State Issues
- Previous/Next buttons must update based on new position
- Page state must be preserved in custom_id
- ConfigId extraction must handle legacy applications

## Future Enhancements

Potential improvements for future versions:
1. Search/filter functionality within select menu
2. Visual completion indicators for finished applications
3. Keyboard shortcuts for power users
4. Bulk operations from select menu
5. Smart sorting options (by score, status, completion)

## Related Documentation

- [Cast Ranking System](CastRanking.md) - Parent feature documentation
- [Components V2](../architecture/ComponentsV2.md) - UI component requirements
- [Button Handler Factory](../architecture/ButtonHandlerFactory.md) - Handler patterns

## Code References

- **Helper Function:** `app.js:550-637` - `createApplicantSelectOptions()`
- **Select Handler:** `app.js:5459-5884` - `ranking_select` handler
- **Integration Points:** 
  - `app.js:7957` - Main season_app_ranking
  - `app.js:5069` - Rank button handlers
  - `app.js:5340` - Navigation handlers
  - `app.js:5600` - Casting status handlers

---

*Last Updated: January 2025*  
*Feature Request: User complaint about 42-application navigation*  
*Implementation Time: ~1 hour*