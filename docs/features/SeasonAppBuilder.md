# Season Application Builder

This document serves as the source of truth for the Season Application Builder feature in CastBot. Any updates, clarifications, or additional information about this feature should be documented here.

## Overview

### Overall Objectives

**For Server Admins:**
- Create application buttons for prospective player recruitment
- Efficiently review and rank applicants through a unified dashboard
- Manage the application process for Discord-based reality games (ORGs)
- Streamline player recruitment with automated application collection

**For Applicants/Players:**
- Simple application process via clicking application buttons
- Private application channels for submitting applications
- Clear indication of application status

### Current Implementation Status

The Season Application Builder is currently a **basic applicant recruitment system** accessible through Production Menu > Season Applications. It provides application button creation and applicant ranking functionality, but does **not** include advanced features like dynamic question builders or structured application forms.

### Access Path

**Production Menu** (`/menu`) → **📝 Season Applications** → Available features

### Alignment to Existing CastBot Features

**Integration Points:**
1. **Production Menu**: Accessible through established menu system
2. **Permission Model**: Uses CastBot's admin permission checking
3. **Storage System**: Integrates with playerData.json storage
4. **Analytics**: Tracks interactions through existing analytics system
5. **Components V2**: Uses modern Discord UI components

## As-Built Deployment

### ✅ Current Features (Production Ready)

#### **📝 Create Application Process** (`season_app_creation`)
**Status:** Fully implemented and operational
**Function:** Creates application buttons that generate private application channels

**Features:**
- Modal-based application button configuration
- Custom button text and explanatory messages
- Channel/category selection for application placement
- Private channel creation with proper permissions
- Integration with existing applicationManager.js

**Admin Requirements:** Manage Roles, Manage Channels, OR Manage Server permissions

**Implementation:**
- Handler: `season_app_creation` in app.js (~line 4827)
- Module: Reuses applicationManager.js functionality
- Data: Stores applications in playerData.json

#### **🏆 Cast Ranking** (`season_app_ranking`) 
**Status:** Fully implemented and operational
**Function:** Comprehensive applicant ranking and evaluation system

**Features:**
- **Visual Applicant Display**: Shows applicant avatars using Media Gallery Components V2
- **1-5 Rating System**: Individual scoring with visual feedback (selected scores appear green)
- **Navigation Controls**: Previous/Next buttons for multi-applicant evaluation
- **Score Analytics**: Real-time average scores and vote counts
- **Ranking Leaderboard**: "View All Scores" with medal rankings (🥇🥈🥉)
- **Application Integration**: Direct links to applicant channels

**Admin Requirements:** Manage Roles, Manage Channels, OR Manage Server permissions

**Implementation:**
- Handler: `season_app_ranking` in app.js (~line 4866)
- Rating Handlers: `rank_[score]_[channelId]_[appIndex]` in app.js (~line 3381)
- Navigation: `ranking_prev_[index]` / `ranking_next_[index]` in app.js (~line 3597)
- Summary: `ranking_view_all_scores` in app.js (~line 3597)

**Data Structure:**
```json
{
  "guildId": {
    "applications": {
      "appId": {
        "displayName": "Applicant Name",
        "userId": "123456789",
        "channelId": "application_channel_id",
        "avatarURL": "avatar_url"
      }
    },
    "rankings": {
      "channelId": {
        "adminUserId": 4,
        "anotherAdminUserId": 5
      }
    }
  }
}
```

## Product Backlog

### Future Enhancement: Dynamic Question Builder System
**Description:** Advanced application form creation with custom questions
**Priority:** Medium
**Status:** Not implemented - requires significant development

**Planned Features:**
- Custom question creation interface
- Multiple question types (text, multiple choice, rating, checkbox)
- Sequential modal question presentation
- Structured response collection and storage
- Advanced applicant dashboard with response filtering

**Technical Approach:**
- Could leverage Safari framework infrastructure for dynamic content creation
- Modal-based UI working within Discord's 5-field limitation
- Data separation between applications and responses
- Integration with existing ranking system

### Future Enhancement: Application Templates
**Description:** Pre-built application templates for common ORG formats
**Priority:** Low
**Status:** Not implemented

### Future Enhancement: Advanced Analytics
**Description:** Application completion rates, response analysis, and insights
**Priority:** Low  
**Status:** Not implemented

## Releases (Release Backlog)

### Sprint 1: Advanced Question Builder (Planning Phase)
**Target:** Dynamic question creation and management system
**Status:** ❌ Not started
**Features:**
- [ ] Question type system implementation
- [ ] Add/Edit/Delete questions interface
- [ ] Question ordering functionality
- [ ] Question preview system
- [ ] Validation rules for text questions

### Sprint 2: Response Collection System (Planning Phase)
**Target:** Structured applicant response collection
**Status:** ❌ Not started
**Features:**
- [ ] Sequential modal question presentation
- [ ] Response validation and error handling
- [ ] Progress tracking between questions
- [ ] Response storage system
- [ ] Submission confirmation workflow

### Sprint 3: Enhanced Admin Dashboard (Planning Phase)
**Target:** Advanced applicant review and management
**Status:** ❌ Not started
**Features:**
- [ ] Response filtering and search
- [ ] Export functionality (CSV/JSON)
- [ ] Bulk applicant status updates
- [ ] Advanced sorting options
- [ ] Application analytics dashboard

## Technical Implementation

### Current Architecture
- **Access**: Production Menu → Season Applications submenu
- **Permissions**: Admin-only features (Manage Roles/Channels/Server)
- **Storage**: playerData.json with applications and rankings sections
- **UI**: Discord Components V2 with Media Gallery support
- **Integration**: Uses existing CastBot infrastructure

### Current Limitations
- No dynamic question creation
- No structured application forms
- Limited to basic channel-based application process
- No advanced applicant filtering or search
- No response data collection beyond basic applicant info

### Future Technical Considerations
- **Safari Integration**: Could leverage Safari's dynamic content framework
- **Modal Limitations**: Discord's 5-field per modal limit affects question presentation
- **Data Scaling**: Current JSON-based storage suitable for small-medium servers
- **Performance**: Real-time ranking updates work well for current implementation

## Documentation Notes

**Previous Version Issues:**
- Documentation previously claimed features were implemented when they were not
- Confused slash commands with menu-based access
- Overstated current capabilities

**Current Accuracy:**
- This document now reflects actual implemented features
- Clear distinction between current functionality and planned enhancements
- Accurate access paths and implementation details