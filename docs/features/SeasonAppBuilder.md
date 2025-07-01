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
**Description:** Advanced application form creation with custom questions and automated data collection
**Priority:** High (increased from Medium due to DNC and Accommodations features)
**Status:** Requirements documented, ready for implementation

## Dynamic Question Builder System - Detailed Requirements

### Overview & User Experience Flow

The Dynamic Question Builder System enables server admins to create sophisticated, multi-step application processes with custom questions, automated data collection, and intelligent user experience flows. The system leverages CastBot's existing Safari-style entity management interface for configuration and Discord Components V2 for modern user interactions.

### UI/UX Architecture

**Management Interface Pattern:**
- **Primary Access**: Safari Manage Items Interface style
- **Entity Selection**: String select with seasons (`entity_select_seasons`)
  - Existing seasons listed by name
  - "➕ New Season" option for creation
- **Entity Management**: Container-based `entity_field_group_*` interface
- **Configuration**: Modal-driven text inputs for question setup
- **Question Management**: Button-launched modals for each question type

**Season as Master Entity:**
- Seasons become master data entities throughout CastBot
- Future integration with automatic Season Castlists
- Persistent season data for cross-feature utilization
- Guild-specific season management with reusable configurations

### Question Types & Implementation

#### 1. Generic Free-Text Question
**Purpose:** User-defined questions requiring text responses
**Configuration Requirements:**
- Question text (required, 1-300 characters)
- Placeholder text (optional, helpful hint)
- Character limit (optional, 1-4000 characters)
- Required/Optional flag
- Order position in application flow

**Implementation:**
- Modal presentation with single text input field
- Input validation based on character limits
- Rich text support for question display
- Response storage as plain text

**Data Structure:**
```json
{
  "questionId": "q_text_001",
  "type": "text",
  "question": "Tell us about your ORG experience",
  "placeholder": "Describe previous games, hosting experience, etc.",
  "charLimit": 2000,
  "required": true,
  "order": 1
}
```

#### 2. Pronouns, Age, and Timezone Integration
**Purpose:** Leverage CastBot's menu system with enhanced automation
**Enhanced Features:**
- **Flexible Positioning**: Admins choose where in application flow
- **Auto-Progression**: Automatically advance to next question after completion
- **Streamlined UX**: Reduced clicks through intelligent flow design
- **Pre-Population**: Use existing player data if available

**Configuration Requirements:**
- Enable/disable each component (pronouns/age/timezone)
- Position in application sequence
- Auto-advance settings
- Custom instruction text per component

**Implementation:**
- Reuse existing `/menu` component infrastructure
- Enhanced with auto-progression logic
- Integration with application flow state machine
- Smart defaults based on existing player data

**Data Structure:**
```json
{
  "questionId": "q_profile_001",
  "type": "profile",
  "components": ["pronouns", "age", "timezone"],
  "autoAdvance": true,
  "customInstructions": {
    "pronouns": "Select your pronouns for the application",
    "age": "Confirm your age for age-restricted challenges",
    "timezone": "Your timezone helps with challenge scheduling"
  },
  "order": 2
}
```

#### 3. Do Not Cast (DNC) System
**Purpose:** Advanced DNC list management with server integration and admin alerts
**Core Features:**
- **User Select Component**: Multi-select from server members
- **External User Entry**: Name/username for non-server members
- **Bidirectional Detection**: Alert when mutual DNCs apply
- **Admin Integration**: Proactive notifications for casting conflicts
- **Cast Ranking Integration**: Visual warnings in ranking interface

**Configuration Requirements:**
- Question text customization
- Maximum DNC selections (recommended: 3-5)
- Include external users option (enabled/disabled)
- Alert thresholds for admin notifications
- Integration with Cast Ranking system

**Implementation Details:**
- **Components V2 User Select**: Multi-user selection interface
- **External User Modal**: Name + Username fields with validation
- **Conflict Detection Engine**: Real-time bidirectional DNC checking
- **Admin Alert System**: Automated notifications via Discord DM or channel
- **Visual Indicators**: Red warning badges in Cast Ranking interface
- **Data Privacy**: DNC lists visible only to admins and applicant

**Data Structure:**
```json
{
  "questionId": "q_dnc_001",
  "type": "dnc",
  "question": "Please select any server members you prefer not to be cast with",
  "maxSelections": 5,
  "allowExternal": true,
  "externalPrompt": "Add external users by name/username",
  "alertAdmins": true,
  "order": 4
}
```

**Response Data Structure:**
```json
{
  "serverMembers": [
    {
      "userId": "123456789",
      "displayName": "Player Name",
      "username": "playername"
    }
  ],
  "externalUsers": [
    {
      "name": "External Player",
      "username": "externaluser",
      "notes": "From previous season"
    }
  ]
}
```

**Admin Alert Features:**
- **Mutual DNC Detection**: "⚠️ Mutual DNC Alert: Player A and Player B have each other on DNC lists"
- **Cast Ranking Integration**: Red warning badges next to conflicting applicants
- **Threshold Alerts**: Notify when applicant has unusually high DNC count
- **Casting Suggestions**: Highlight potential DNC-free casting combinations

#### 4. Accommodations System
**Purpose:** Comprehensive accessibility and accommodation tracking with admin integration
**Core Features:**
- **Predefined Options**: Common accommodations in string select
- **Custom Entry**: Free-text for specific needs
- **Admin Integration**: Accommodations visible in Cast Ranking
- **Challenge Integration**: Future integration with challenge design
- **Privacy Controls**: Accommodation visibility settings

**Configuration Requirements:**
- Predefined accommodation list management
- Custom entry enabled/disabled
- Privacy settings (admin-only vs. host-visible)
- Integration with Cast Ranking display
- Future challenge system hooks

**Predefined Accommodations List:**
- Colorblindness (specify type)
- Dyslexia/Reading difficulties
- Hearing impairment
- Visual impairment
- Motor/Dexterity limitations
- Cognitive processing differences
- Timezone restrictions
- Language barriers (ESL support)
- Anxiety/Social considerations
- Custom (specify details)

**Implementation Details:**
- **String Select Menu**: Predefined options with multi-select capability
- **Custom Modal**: Free-text entry for specific accommodations
- **Privacy Controls**: Admin-only vs. host-visible settings
- **Admin Dashboard**: Accommodation summary in Cast Ranking
- **Challenge Integration**: Future hooks for challenge design considerations

**Data Structure:**
```json
{
  "questionId": "q_accommodations_001",
  "type": "accommodations",
  "question": "Do you have any accommodations we should consider?",
  "predefinedOptions": [
    "Colorblindness",
    "Dyslexia/Reading difficulties", 
    "Hearing impairment",
    "Visual impairment",
    "Motor/Dexterity limitations",
    "Timezone restrictions",
    "Custom (specify details)"
  ],
  "allowCustom": true,
  "privacy": "admin-only",
  "order": 5
}
```

**Response Data Structure:**
```json
{
  "predefined": ["Colorblindness", "Timezone restrictions"],
  "custom": "Red-green colorblind, need high contrast images. PST timezone, available evenings only.",
  "privacy": "admin-only"
}
```

### Technical Architecture

#### Data Storage Structure

**Season Master Data:**
```json
{
  "guildId": {
    "seasons": {
      "season_001": {
        "name": "Season 1: Pirates Theme",
        "created": "2025-01-01T00:00:00Z",
        "createdBy": "391415444084490240",
        "status": "active",
        "applicationChannel": "channel_id",
        "applicationMessage": "message_id",
        "questions": [...],
        "settings": {
          "autoAdvance": true,
          "dncAlerts": true,
          "accommodationPrivacy": "admin-only"
        }
      }
    }
  }
}
```

**Application Response Data:**
```json
{
  "guildId": {
    "applications": {
      "app_001": {
        "seasonId": "season_001",
        "userId": "user_id",
        "displayName": "Applicant Name",
        "channelId": "application_channel_id",
        "status": "completed",
        "submitted": "2025-01-01T12:00:00Z",
        "responses": {
          "q_text_001": "My ORG experience text...",
          "q_profile_001": {
            "pronouns": "They/Them",
            "age": 25,
            "timezone": "PST (UTC-8)"
          },
          "q_dnc_001": {
            "serverMembers": [...],
            "externalUsers": [...]
          },
          "q_accommodations_001": {
            "predefined": ["Colorblindness"],
            "custom": "Red-green colorblind details..."
          }
        },
        "dncConflicts": [
          {
            "conflictType": "mutual",
            "otherApplicant": "app_002",
            "severity": "high"
          }
        ]
      }
    }
  }
}
```

#### Implementation Modules

**Primary Module: `seasonQuestionBuilder.js`**
- Season management (CRUD operations)
- Question configuration interface
- Question type handlers
- Application flow state machine
- DNC conflict detection engine
- Accommodation processing system

**Integration Modules:**
- **Enhanced `applicationManager.js`**: Extended for multi-step application flows
- **DNC Conflict Engine**: Real-time bidirectional conflict detection
- **Admin Alert System**: Integration with existing analytics/notification systems
- **Cast Ranking Enhancement**: DNC warnings and accommodation displays

#### User Interface Components

**Season Management Interface:**
```javascript
// String Select for Season Selection
{
  type: 3, // String Select
  custom_id: 'entity_select_seasons',
  placeholder: 'Select a season to manage',
  options: [
    {
      label: '➕ Create New Season',
      value: 'create_new',
      emoji: { name: '➕' }
    },
    {
      label: 'Season 1: Pirates Theme',
      value: 'season_001',
      description: '5 questions, 12 applications'
    }
  ]
}
```

**Question Configuration Buttons:**
```javascript
// Container Component with Question Management
{
  type: 17, // Container
  accent_color: 0x5865F2,
  components: [
    {
      type: 2, // Button
      style: 1, // Primary
      custom_id: 'season_add_question_text',
      label: '📝 Add Text Question',
      emoji: { name: '📝' }
    },
    {
      type: 2, // Button
      style: 1, // Primary  
      custom_id: 'season_add_question_profile',
      label: '👤 Add Profile Questions',
      emoji: { name: '👤' }
    },
    {
      type: 2, // Button
      style: 1, // Primary
      custom_id: 'season_add_question_dnc',
      label: '⚠️ Add DNC Question',
      emoji: { name: '⚠️' }
    },
    {
      type: 2, // Button
      style: 1, // Primary
      custom_id: 'season_add_question_accommodations',
      label: '♿ Add Accommodations',
      emoji: { name: '♿' }
    }
  ]
}
```

#### Application Flow State Machine

**Flow Control:**
1. **Question Sequence**: Ordered presentation based on question.order
2. **Auto-Progression**: Automatic advancement for profile questions
3. **Validation Gates**: Required field checking before progression
4. **State Persistence**: Save partial progress between questions
5. **Completion Detection**: Trigger final submission and notifications

**State Management:**
```json
{
  "applicationState": {
    "currentQuestion": 2,
    "totalQuestions": 5,
    "completedQuestions": [1],
    "partialResponses": {...},
    "startTime": "2025-01-01T12:00:00Z",
    "lastActivity": "2025-01-01T12:05:00Z"
  }
}
```

### Administrative Features

#### Bulk Casting Operations
**Purpose:** Streamlined casting decisions with automated communication to application channels
**Core Features:**
- **CAST Invitations**: Bulk send casting offers to selected applicants
- **HOLD Status**: Mark applicants as substitutes/backup cast with appropriate messaging  
- **REJECT Notifications**: Send polite rejection messages to non-selected applicants
- **Application Channel Integration**: All communications sent directly to applicant's private channel

**Casting Workflow:**
1. **Selection Interface**: Multi-select from ranked applicants in Cast Ranking
2. **Bulk Action Buttons**: "📤 Send Cast Invites", "⏸️ Mark as HOLD", "❌ Send Rejections"
3. **Message Customization**: Season-specific templates with personalization
4. **Status Tracking**: Application status updates (Pending → Cast/Hold/Rejected)
5. **Confirmation Workflow**: Applicants confirm acceptance within application channel

**Implementation Details:**
- **Multi-Select Interface**: Checkbox selection in Cast Ranking dashboard
- **Template System**: Customizable message templates per season
- **Status Management**: Persistent application status tracking
- **Channel Messaging**: Direct communication via application channels
- **Confirmation Tracking**: Track acceptance/decline responses

**Message Templates:**

**CAST Invitation Template:**
```
🎉 **Congratulations!** 🎉

You are kindly offered a spot in our **{SEASON_NAME}** cast!

To accept this offer, please confirm:
• Your preferred display name
• Age, pronouns, and timezone
• Any photo you'd like for your casting card (optional)

We can't wait to have you play! Please respond to confirm your acceptance.

**Next Steps:**
• Check-in: {CHECK_IN_DATE}
• Game Start: {MAROONING_DATE}
```

**HOLD Status Template:**
```
📋 **Application Update** 📋

Thank you for your interest in **{SEASON_NAME}**!

We're placing you on our **substitute list** for this season. This means:
• You're a strong candidate we'd love to have play
• If any cast members drop out, you'll be our first choice as a replacement
• We'll notify you immediately if a spot opens up

Please keep your schedule flexible around our start date: **{MAROONING_DATE}**

Thank you for your patience!
```

**REJECT Template:**
```
📝 **Application Update** 📝

Thank you so much for applying to **{SEASON_NAME}**!

Unfortunately, we won't be able to offer you a spot this season. The competition was incredibly strong, and casting decisions are always difficult.

We encourage you to:
• Apply for future seasons - we'd love to see you again!
• Join our spectator channels to follow this season
• Stay active in the community

Thank you for your interest, and we hope to see you in future seasons!
```

**Data Structure for Casting Operations:**
```json
{
  "castingOperations": {
    "season_001": {
      "cast": ["app_001", "app_003", "app_005"],
      "hold": ["app_007", "app_009"],
      "rejected": ["app_002", "app_004", "app_006"],
      "pending": ["app_008", "app_010"],
      "castingDate": "2025-01-15T00:00:00Z",
      "checkInDate": "2025-01-20T00:00:00Z",
      "marooningDate": "2025-01-22T00:00:00Z"
    }
  }
}
```

#### DNC Conflict Detection & Alerts

**Real-Time Conflict Detection:**
- Monitor applications for bidirectional DNC matches
- Generate immediate alerts when conflicts detected
- Severity scoring based on mutual vs. unidirectional DNCs
- Admin notification through Discord DM or dedicated channel

**Cast Ranking Integration:**
- Visual DNC conflict indicators in ranking interface
- Red warning badges for conflicted applicants
- Conflict details on hover/click
- Suggested alternative casting combinations

**Alert Message Format:**
```
🚨 **DNC Conflict Alert** 🚨

**Season:** Pirates Theme Season 1
**Conflict Type:** Mutual DNC
**Applicants:** @Player1 ↔ @Player2

**Details:**
• Player1 listed Player2 on DNC
• Player2 listed Player1 on DNC  
• Both applications completed

**Actions:**
🔍 View in Cast Ranking
📋 Review Applications
⚠️ Consider for Casting
```

#### Accommodation Management

**Admin Dashboard Integration:**
- Accommodation summary in Cast Ranking interface
- Privacy-controlled visibility (admin-only vs. host-visible)
- Accommodation type filtering for casting decisions
- Challenge design integration hooks for future development

**Accommodation Display:**
```
♿ **Accommodations Summary**

**Player:** @ApplicantName
**Accommodations:**
• Colorblindness (Red-Green)
• Timezone: PST evenings only
• Custom: Needs high contrast images

**Privacy:** Admin Only
**Challenge Considerations:** ⚠️ Visual challenges need review
```

### Future Integration Opportunities

#### Season Castlist Generation
- Automatic castlist creation from accepted applications
- Season-based tribe/alliance assignments
- Integration with existing castlist system
- Season archives with final casting decisions

#### Challenge System Integration
- Accommodation-aware challenge design
- DNC-influenced team formation
- Timezone-based challenge scheduling
- Accessibility compliance checking

#### Advanced Analytics
- Application completion rates by question type
- DNC pattern analysis for server health
- Accommodation trend tracking
- Seasonal comparison metrics

### Migration & Rollout Strategy

**Phase 1: Core Infrastructure (Sprint 1)**
- Season management system
- Basic question builder interface
- Text question implementation
- Data storage framework

**Phase 2: Advanced Question Types (Sprint 2)**  
- Profile questions integration
- DNC system implementation
- Accommodations system
- Application flow state machine

**Phase 3: Admin Enhancement (Sprint 3)**
- DNC conflict detection & alerts
- Cast Ranking integration
- **Bulk casting operations** (CAST/HOLD/REJECT)
- **Message template system** for casting communications
- Admin dashboard enhancements

**Phase 4: Advanced Features (Sprint 4)**
- Advanced reporting and analytics
- Season castlist generation integration
- Application template system
- Enhanced admin notifications

**Phase 5: Future Integration (Post-MVP)**
- Challenge system hooks
- Advanced analytics dashboard
- Cross-season data analysis
- AI-powered casting recommendations

This comprehensive system transforms the basic application collection into a sophisticated, automated recruitment and management platform that addresses the specific needs of Discord-based ORG communities while maintaining the intuitive, Safari-style interface patterns that users are familiar with.

## Real Application Analysis & System Improvements

### Current State Analysis (Based on Sample Application)

**Sample Application Overview:**
- **Applicant**: Kayla (kay8978)
- **Season**: EpochORG S9: Land Before Time  
- **Duration**: 3-day process (June 11-14, 2025)
- **Bots Used**: 3 different Discord bots (disconnected workflow)

**Current Pain Points Identified:**

#### 1. **Fragmented Bot Ecosystem**
- **Current**: Application uses 3 separate bots with no integration
- **Issues**: 
  - Inconsistent user experience
  - Manual data transfer between systems
  - Higher chance of errors and lost information
- **CastBot Solution**: Single integrated system with all functionality

#### 2. **Clunky Command-Based Interface**
- **Current**: Carl-bot with `!q2`, `!q3`, `!q4` sequential commands
- **Issues**:
  - Users must remember exact command syntax
  - No progress tracking or validation
  - Prone to user error and confusion
- **CastBot Solution**: Modal-based sequential presentation with auto-progression

#### 3. **Manual Profile Collection**
- **Current**: Separate `/menu` command required before application
- **Issues**:
  - Additional step users often forget
  - Pronouns missed initially (had to be corrected later)
  - No integration with application flow
- **CastBot Solution**: Integrated profile questions with auto-progression and pre-population

#### 4. **Limited Question Types**
- **Current**: Only basic text questions supported
- **Issues**:
  - No structured data collection
  - No DNC list functionality
  - Basic accommodations question with no follow-up
  - No validation or data processing
- **CastBot Solution**: 4 specialized question types with structured data collection

#### 5. **Manual Casting Process**
- **Current**: Manual messages sent by production team members
- **Issues**:
  - Inconsistent messaging
  - No bulk operations
  - No status tracking
  - Additional manual requests for cast card info
- **CastBot Solution**: Automated bulk casting operations with template messaging

### Question Type Analysis from Sample

**Existing Questions Successfully Handled:**
1. **Personal Introduction** → Generic Free-Text Question ✅
2. **Survivor Experience** → Generic Free-Text Question ✅  
3. **Player Archetype** → Could be String Select or Free-Text ✅
4. **Hero/Villain Alignment** → Could be String Select or Free-Text ✅
5. **Activity Schedule** → Generic Free-Text Question ✅
6. **Conflicts/Availability** → Generic Free-Text Question ✅
7. **Fun/Personality Question** → Generic Free-Text Question ✅
8. **Accommodations** → Enhanced Accommodations System ✅

**Missing from Sample (Addressed by CastBot):**
- **Pronouns/Age/Timezone**: Manual process → Integrated Profile Questions
- **DNC Lists**: Not collected → Advanced DNC System
- **Structured Accommodations**: Basic text → Predefined + Custom options

### Improved User Experience Flow

**Current Flow (Fragmented):**
```
1. Click Apply Button (Bot 1)
2. Run /menu command (CastBot) 
3. Type !q2, !q3, !q4... (Carl-bot)
4. Type !end (Carl-bot)
5. Wait for manual check-in message
6. Wait for manual casting decision
7. Manually provide additional info if cast
```

**CastBot Flow (Integrated):**
```
1. Click Apply Button (CastBot)
2. Sequential modal presentation:
   • Profile Questions (auto-filled if available)
   • Custom Text Questions 
   • DNC Selection Interface
   • Accommodations Selection
3. Automatic submission confirmation
4. Automated check-in reminder
5. Bulk casting decision with status update
6. Integrated acceptance confirmation
```

### Template Questions Based on Sample

**Suggested Question Templates for Season Setup:**

```json
{
  "commonQuestions": [
    {
      "type": "text",
      "question": "Tell us a little about yourself! What are your hobbies, interests, pet peeves, etc?",
      "placeholder": "Share as much as you'd like so we can get to know you!",
      "charLimit": 2000,
      "required": true
    },
    {
      "type": "text", 
      "question": "Do you watch Survivor? If yes, what are some of your favorite seasons and players?",
      "placeholder": "Share your favorites and why you like them",
      "charLimit": 1500,
      "required": false
    },
    {
      "type": "text",
      "question": "Which archetype fits you best: challenge beast, social butterfly, or strategic mastermind? Why?",
      "placeholder": "Describe your play style and approach",
      "charLimit": 1000,
      "required": true
    },
    {
      "type": "text",
      "question": "Do you consider yourself more of a hero, villain, or neither? Why?",
      "placeholder": "Explain your approach to competition and gameplay",
      "charLimit": 1000,
      "required": true
    },
    {
      "type": "text",
      "question": "How active do you plan on being? What times of day will you be most active?",
      "placeholder": "Help us understand your availability and schedule",
      "charLimit": 1000,
      "required": true
    },
    {
      "type": "text",
      "question": "Are you playing any other ORGs or have real life events that might interfere?",
      "placeholder": "Let us know about any potential conflicts",
      "charLimit": 1000,
      "required": true
    }
  ]
}
```

### Competitive Advantages Over Current System

1. **Single Bot Integration**: No more juggling 3 different bots
2. **Modern UI**: Discord Components V2 vs. command-line interface
3. **Data Integrity**: Structured collection vs. free-form text parsing
4. **Automated Workflows**: Bulk operations vs. manual processes
5. **Advanced Features**: DNC detection, accommodation tracking, conflict alerts
6. **Consistent Experience**: Template-driven vs. ad-hoc messaging
7. **Progress Tracking**: Real-time state management vs. no progress indication
8. **Error Prevention**: Validation and confirmation vs. manual error checking

This analysis demonstrates how the Dynamic Question Builder System directly addresses real pain points experienced by ORG communities while providing significant improvements in user experience, data quality, and administrative efficiency.

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
**Target:** Advanced applicant review and bulk casting operations
**Status:** ❌ Not started
**Features:**
- [ ] DNC conflict detection and alert system
- [ ] Cast Ranking integration with DNC warnings
- [ ] **Bulk casting operations (CAST/HOLD/REJECT)**
- [ ] **Message template system for casting communications**
- [ ] Response filtering and search capabilities
- [ ] Admin dashboard enhancements

### Sprint 4: Advanced Features (Planning Phase)
**Target:** Enhanced reporting and application management
**Status:** ❌ Not started
**Features:**
- [ ] Export functionality (CSV/JSON)
- [ ] Application analytics dashboard
- [ ] Season castlist generation integration
- [ ] Application template system
- [ ] Advanced sorting and filtering options

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