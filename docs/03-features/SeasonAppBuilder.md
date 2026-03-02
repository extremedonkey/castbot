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

The Season Application Builder has been significantly enhanced with **Phase 1 complete**. It now includes:

**✅ COMPLETED - Phase 1 (January 2025):**
- **Season Management System**: Create and manage seasons with unique IDs and questions
- **Dynamic Question Builder**: Add, edit, reorder, and delete application questions
- **Enhanced Application Flow**: Multi-question application process for applicants
- **Redesigned Creation UX**: Container-based interface with manual submission
- **Migration System**: Automatic conversion of legacy configs to season-based structure

**🔄 NEXT PRIORITY:**
- **Discord Components V2 Limits**: Need replacement solution for seasons with many questions (>6-8 questions hit component limits)
  - Current issue: Individual question management buttons exceed Discord's container component limits
  - Proposed solutions pending design discussion
  - Affects: Question management interface for seasons with extensive question sets

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

#### **📝 Season Management System** (`season_management_menu`)
**Status:** Fully implemented and operational (Phase 1 Complete)
**Function:** Comprehensive season-based application management system

**Features:**
- **Season Creation**: Create seasons with unique IDs and names
- **Question Management**: Add, edit, reorder, and delete application questions
- **Migration System**: Automatic conversion of legacy application configs
- **Container-based UI**: Modern Components V2 interface with real-time status
- **Manual Creation Flow**: Three-step selection (channel, category, style) with explicit Create button
- **Multi-question Applications**: Progressive question display for applicants

**Admin Requirements:** Manage Roles, Manage Channels, OR Manage Server permissions

**Implementation:**
- Main Handler: `season_management_menu` in app.js (~line 4614)
- Entity Selection: `entity_select_seasons` handler for season selection
- Question Management: Multiple handlers for question CRUD operations
- Application Flow: Enhanced multi-question application process
- Container Creation: `createApplicationSetupContainer()` in applicationManager.js

#### **🔧 Enhanced Application Creation Flow**
**Status:** Completely redesigned (January 2025)
**Function:** User-friendly application button creation with real-time feedback

**Features:**
- **Container Interface**: All selections in a single Components V2 container
- **Real-time Status**: Visual indicators for selection completion (✅/❌)
- **Preloaded Values**: Existing selections preserved when refreshing UI
- **Manual Submission**: Create button disabled until all selections complete
- **Dynamic Styling**: Container changes color when ready (blue → green)

**UX Flow:**
1. User fills modal with button details
2. Container displays with three select menus (channel, category, style)
3. Real-time status updates as selections are made
4. Create button becomes active when all selections complete
5. Manual click creates and posts the application button

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

**Data Structure (Updated Phase 1):**
```json
{
  "guildId": {
    "config_[timestamp]_[creatorUserId]": {
      "buttonText": "Apply to Season 3",
      "explanatoryText": "You are cool!",
      "channelFormat": "%name%-meow",
      "targetChannelId": "1337754151655833694",
      "categoryId": "1334493817231114271",
      "buttonStyle": "Primary",
      "createdBy": "391415444084490240",
      "stage": "active",
      "createdAt": 1751465787477,
      "lastUpdated": 1751465787477,
      
      // NEW Phase 1 fields:
      "seasonId": "season_03859e4abc554bb5",
      "seasonName": "Season 3 Applications",
      "questions": [
        {
          "id": "question_30c92b66a8364840",
          "order": 1,
          "questionTitle": "Welcome",
          "questionText": "Welcome to your application...",
          "createdAt": 1751550297411
        },
        {
          "id": "question_16591fb65b054d5b", 
          "order": 2,
          "questionTitle": "Name & Location",
          "questionText": "Please confirm your information...",
          "createdAt": 1751550324378
        }
      ]
    },
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

## Phase 1 Implementation Summary (January 2025)

### Key Accomplishments

**✅ Season Management System:**
- UUID-based season IDs using `crypto.randomUUID()`
- Automatic migration of legacy configs (`config_*` entries without seasonId get migrated)
- Season creation and selection via dropdown interface
- Backward compatibility maintained with existing application configs

**✅ Dynamic Question Builder:**
- Add, edit, reorder, and delete questions within seasons
- Question management with individual Up/Down/Edit/Delete buttons
- Progressive question display for applicants during application process
- Question IDs and ordering system implemented

**✅ Enhanced UX Design:**
- Container-based application creation interface (Components V2)
- Real-time selection status display (✅ Selected / ❌ Not selected)
- Preloaded select menus preserve existing values
- Manual submission via Create button (no auto-submission)
- Dynamic container styling (blue → green when ready)

**✅ Technical Infrastructure:**
- `createApplicationSetupContainer()` helper function for UI consistency
- Enhanced select menu builders with default value support
- Comprehensive handlers for all CRUD operations
- Debug logging for troubleshooting

### Known Limitations

**⚠️ Discord Components V2 Limits:**
Seasons with many questions (>6-8) exceed Discord's component limits when displaying individual question management buttons. This causes the interface to fail for seasons like "Power Grab Season 5" with 8+ questions.

**Proposed Solutions (Pending):**
- Compact display with dropdown selection instead of individual buttons
- Pagination system for question management
- Alternative UI patterns to work within Discord limits

## Migration Strategy: Bridging Current and Future Designs

### Overview

To enable a smooth transition from the current basic implementation to the advanced Dynamic Question Builder System, we've designed a middle ground JSON structure that maintains backward compatibility while progressively enabling new features.

### Middle Ground Data Structure

The following structure preserves all existing functionality while providing a clear upgrade path:

```json
{
  "guildId": {
    // PHASE 1: Keep existing structure, add season reference
    "applicationConfigs": {
      "config_[timestamp]_[userId]": {
        // All existing fields remain unchanged
        "buttonText": "Apply to Season 3!",
        "explanatoryText": "Join our amazing season!",
        "welcomeTitle": "Welcome to Your Application",
        "welcomeDescription": "Type ?q1 to begin",
        "channelFormat": "%name%-app",
        "targetChannelId": "...",
        "categoryId": "...",
        "buttonStyle": "Primary",
        "createdBy": "...",
        "stage": "active",
        "createdAt": 1749305698428,
        "lastUpdated": 1749305698428,
        
        // NEW: Optional season reference for migration
        "seasonId": "season_001",
        
        // NEW: Optional question configuration (starts empty)
        "questions": []
      }
    },
    
    // PHASE 2: Introduce seasons as lightweight metadata
    "seasons": {
      "season_001": {
        "name": "Season 3: Island Adventure",
        "configId": "config_1749305698427_391415444084490240",
        "created": "2025-01-01T00:00:00Z",
        "createdBy": "391415444084490240",
        "status": "active",
        
        // Start with basic settings, expand over time
        "settings": {
          "autoAdvance": false,
          "dncEnabled": false,
          "accommodationsEnabled": false
        },
        
        // Questions start empty, populated when admin configures
        "questions": [],
        
        // Casting operation metadata
        "casting": {
          "checkInDate": null,
          "marooningDate": null,
          "templates": {
            "cast": null,
            "hold": null,
            "reject": null
          }
        }
      }
    },
    
    // PHASE 3: Enhanced applications with backward compatibility
    "applications": {
      "[channelId]": {
        // All existing fields remain
        "userId": "...",
        "channelId": "...",
        "username": "...",
        "displayName": "...",
        "avatarURL": "...",
        "channelName": "...",
        "createdAt": "2025-07-02T15:47:44.287Z",
        "configId": "config_1751471261095_391415444084490240",
        
        // NEW: Optional fields for advanced features
        "seasonId": "season_001",
        "status": "pending", // pending, in_progress, completed, cast, hold, rejected
        
        // NEW: Responses object (starts empty, populated as questions are answered)
        "responses": {},
        
        // NEW: Application state tracking
        "progress": {
          "currentQuestion": 0,
          "totalQuestions": 0,
          "completedQuestions": [],
          "lastActivity": "2025-07-02T15:47:44.287Z"
        },
        
        // NEW: Conflict tracking (populated by system)
        "conflicts": {
          "dnc": [],
          "accommodations": []
        }
      }
    },
    
    // Keep existing rankings structure unchanged
    "rankings": {
      "[channelId]": {
        "[adminUserId]": 5
      }
    },
    
    // NEW: Question templates library (reusable across seasons)
    "questionTemplates": {
      "standard_intro": {
        "type": "text",
        "question": "Tell us about yourself!",
        "placeholder": "Share your interests and hobbies",
        "charLimit": 2000,
        "category": "introduction"
      },
      "standard_dnc": {
        "type": "dnc",
        "question": "Are there any players you prefer not to be cast with?",
        "maxSelections": 5,
        "allowExternal": true,
        "category": "preferences"
      }
    }
  }
}
```

### Implementation Phases

#### Phase 1: Backward Compatible Enhancement (Sprint 0.5)
- Add optional `seasonId` field to existing applicationConfigs
- Add empty `questions` array to configs for future use
- Add `status` field to applications (defaults to "pending")
- All existing functionality continues unchanged

#### Phase 2: Season Metadata Introduction (Sprint 1)
- Create lightweight `seasons` object with basic metadata
- Link seasons to configs via bidirectional references
- Add settings flags for future features (all disabled by default)
- Introduce question templates library

#### Phase 3: Progressive Feature Enablement (Sprint 2+)
- Populate questions array when admin configures questions
- Enable responses collection in applications
- Activate conflict tracking for DNC/accommodations
- Implement casting templates and bulk operations

### Key Design Benefits

1. **Zero Breaking Changes**: All existing code continues to work without modification
2. **Gradual Migration**: Features can be adopted incrementally as needed
3. **Storage Efficiency**: Uses references to avoid data duplication
4. **Clear Upgrade Path**: Each phase builds logically on the previous
5. **Flexibility**: Supports both simple (current) and complex (future) workflows

### Migration Example

```javascript
// Current: Basic application button (unchanged)
await saveApplicationConfig(guildId, configId, {
  buttonText: "Apply Now!",
  channelFormat: "%name%-app"
  // ... other fields
});

// Phase 1: Enhanced with season planning
await saveApplicationConfig(guildId, configId, {
  buttonText: "Apply Now!",
  channelFormat: "%name%-app",
  // ... other fields
  seasonId: null, // Ready for future season link
  questions: []   // Ready for future questions
});

// Phase 2: Linked to season
const seasonId = await createSeason(guildId, {
  name: "Season 1: Pirates",
  configId: configId
});
await updateApplicationConfig(guildId, configId, { seasonId });

// Phase 3: Full question system enabled
await updateSeason(guildId, seasonId, {
  questions: [
    { id: "q1", type: "text", question: "Tell us about yourself" },
    { id: "q2", type: "profile", components: ["pronouns", "age", "timezone"] }
  ],
  settings: { autoAdvance: true, dncEnabled: true }
});
```

### Data Compatibility Matrix

| Feature | Current | Phase 1 | Phase 2 | Phase 3 |
|---------|---------|---------|---------|---------|
| Basic Apply Button | ✅ | ✅ | ✅ | ✅ |
| Welcome Messages | ✅ | ✅ | ✅ | ✅ |
| Cast Ranking | ✅ | ✅ | ✅ | ✅ |
| Season Metadata | ❌ | ❌ | ✅ | ✅ |
| Dynamic Questions | ❌ | ❌ | ❌ | ✅ |
| Response Collection | ❌ | ❌ | ❌ | ✅ |
| DNC Conflict Detection | ❌ | ❌ | ❌ | ✅ |
| Bulk Casting Ops | ❌ | ❌ | ❌ | ✅ |

This migration strategy ensures a smooth transition while maintaining system stability and user confidence throughout the enhancement process.

## Architecture & Patterns

### Overview

The Season Application Builder leverages CastBot's proven entity management patterns from the Safari system, ensuring consistency, reusability, and maintainability. This architecture provides a familiar interface for admins while minimizing code duplication.

### Entity Management Integration

Following the Safari system's successful patterns, seasons and questions are managed as entities:

- **Seasons**: Top-level entities (similar to Safari stores)
- **Questions**: Nested content within seasons (similar to store items)
- **Applications**: Reference seasons via `seasonId` and store responses
- **Metadata**: Automatic tracking of creation, modification, and usage

### Configuration Structure

The system extends the existing `editFramework.js` patterns:

```javascript
// Extend EDIT_CONFIGS with Season management
EDIT_CONFIGS['season'] = {
  displayName: 'Season',
  properties: {
    name: { type: 'text', maxLength: 100, required: true, label: 'Season Name' },
    description: { type: 'textarea', maxLength: 500, label: 'Season Description' },
    checkInDate: { type: 'date', label: 'Check-in Date' },
    marooningDate: { type: 'date', label: 'Game Start Date' },
    applicationDeadline: { type: 'date', label: 'Application Deadline' }
  },
  content: {
    type: 'questions',
    label: 'Application Questions',
    maxItems: SEASON_LIMITS.MAX_QUESTIONS_PER_SEASON,
    itemLabel: 'question',
    itemLabelPlural: 'questions'
  },
  operations: ['reorder', 'edit', 'delete', 'add', 'preview', 'duplicate']
};

// Question configuration with dynamic field groups
EDIT_CONFIGS['question'] = {
  displayName: 'Question',
  fieldGroups: {
    basic: {
      label: 'Question Settings',
      fields: {
        type: { type: 'select', options: QUESTION_TYPES, required: true },
        question: { type: 'textarea', maxLength: 300, required: true },
        required: { type: 'boolean', default: true },
        order: { type: 'number', min: 1, max: 99 }
      }
    },
    // Type-specific configurations loaded dynamically
    text: {
      label: 'Text Question Options',
      fields: {
        placeholder: { type: 'text', maxLength: 100 },
        charLimit: { type: 'number', min: 1, max: 4000, default: 2000 },
        multiline: { type: 'boolean', default: true }
      }
    },
    dnc: {
      label: 'DNC Question Options',
      fields: {
        maxSelections: { type: 'number', min: 1, max: 10, default: 5 },
        allowExternal: { type: 'boolean', default: true },
        externalPrompt: { type: 'text', maxLength: 200 }
      }
    }
  }
};
```

### Season Limits Configuration

Following Safari's pattern of centralized limits:

```javascript
// config/seasonLimits.js
export const SEASON_LIMITS = {
  // Season limits
  MAX_SEASONS_PER_GUILD: 25,
  MAX_SEASON_NAME_LENGTH: 100,
  MAX_SEASON_DESCRIPTION_LENGTH: 500,
  
  // Question limits
  MAX_QUESTIONS_PER_SEASON: 20,
  MAX_QUESTION_TEXT_LENGTH: 300,
  MAX_PLACEHOLDER_LENGTH: 100,
  MAX_RESPONSE_LENGTH: 4000,
  
  // Application limits
  MAX_APPLICATIONS_PER_SEASON: 500,
  MAX_DNC_SELECTIONS: 10,
  MAX_ACCOMMODATIONS: 15,
  
  // UI limits
  MAX_DISCORD_MODAL_FIELDS: 5,
  MAX_SELECT_OPTIONS: 25
};

export const QUESTION_TYPES = [
  { label: 'Text Question', value: 'text', emoji: '📝' },
  { label: 'Profile Info', value: 'profile', emoji: '👤' },
  { label: 'Do Not Cast', value: 'dnc', emoji: '⚠️' },
  { label: 'Accommodations', value: 'accommodations', emoji: '♿' }
];
```

### UI Pattern Implementation

The Season Application Builder follows entityManagementUI patterns:

#### Entity Selection Interface
```javascript
// Season selector dropdown (similar to Safari entity selector)
{
  type: 1, // ActionRow
  components: [{
    type: 3, // String Select
    custom_id: 'entity_select_seasons',
    placeholder: 'Select a season to manage...',
    options: [
      {
        label: '➕ Create New Season',
        value: 'create_new',
        emoji: { name: '✨' },
        description: 'Start a new application season'
      },
      // ... existing seasons
    ]
  }]
}
```

#### Management Buttons Pattern
```javascript
// Consistent button layout for season management
{
  type: 1, // ActionRow
  components: [
    {
      type: 2, // Button
      custom_id: 'season_add_question',
      label: 'Add Question',
      style: 1, // Primary
      emoji: { name: '➕' }
    },
    {
      type: 2, // Button
      custom_id: 'season_edit_properties',
      label: 'Edit Properties',
      style: 2, // Secondary
      emoji: { name: '🔧' }
    },
    {
      type: 2, // Button
      custom_id: 'season_preview',
      label: 'Preview',
      style: 2, // Secondary
      emoji: { name: '👁️' }
    }
  ]
}
```

### Entity Manager Integration

Season operations follow entityManager patterns:

```javascript
// seasonEntityManager.js - extends base entity patterns
import { loadPlayerData, savePlayerData } from './storage.js';
import { SEASON_LIMITS } from './config/seasonLimits.js';

export async function loadSeasons(guildId) {
  const data = await loadPlayerData();
  return data[guildId]?.seasons || {};
}

export async function createSeason(guildId, seasonData, userId) {
  // Follows entityManager.createEntity pattern
  const seasons = await loadSeasons(guildId);
  const seasonId = `season_${generateHash(seasonData.name)}`;
  
  // Validate limits
  if (Object.keys(seasons).length >= SEASON_LIMITS.MAX_SEASONS_PER_GUILD) {
    throw new Error(`Maximum seasons limit reached (${SEASON_LIMITS.MAX_SEASONS_PER_GUILD})`);
  }
  
  // Create with metadata
  seasons[seasonId] = {
    id: seasonId,
    ...seasonData,
    questions: [],
    metadata: {
      createdBy: userId,
      createdAt: Date.now(),
      lastModified: Date.now(),
      totalApplications: 0
    }
  };
  
  // Save and return
  await saveSeasonData(guildId, seasons);
  return seasons[seasonId];
}
```

### Question Builder UI Flow

Following Safari's action builder pattern:

1. **Question Type Selection** → Dynamic configuration UI
2. **Configuration Modal** → Type-specific fields
3. **Preview Display** → Show question as applicant will see it
4. **Reorder Interface** → Drag-and-drop or up/down buttons

### Integration Points

#### Module Structure
- **seasonManager.js**: Core season operations (like safariManager.js)
- **seasonEntityManager.js**: CRUD operations following entityManager patterns
- **seasonManagementUI.js**: UI components following entityManagementUI
- **seasonQuestionBuilder.js**: Question-specific logic and validation
- **seasonApplicationFlow.js**: Application state machine and progression

#### Shared Components
- Reuses `editFramework.js` for field configurations
- Extends `entityManager.js` patterns for data operations
- Leverages Components V2 patterns from Safari system
- Shares validation and limit checking approaches

### Benefits of This Architecture

1. **Consistency**: Admins familiar with Safari will recognize the UI patterns
2. **Reusability**: Leverages existing, tested code patterns
3. **Maintainability**: Changes to core patterns benefit all features
4. **Scalability**: Entity-based approach handles growth well
5. **Flexibility**: Easy to add new question types or season features

### Example Implementation Flow

```javascript
// Admin creates new season using familiar UI
const season = await createSeason(guildId, {
  name: "Season 4: Space Pirates",
  description: "An intergalactic adventure",
  checkInDate: "2025-08-01",
  marooningDate: "2025-08-03"
}, adminUserId);

// Add questions using entity patterns
await addQuestionToSeason(guildId, season.id, {
  type: 'text',
  question: 'What makes you a good space pirate?',
  placeholder: 'Describe your space piracy skills',
  charLimit: 1000,
  required: true
});

// UI automatically updates using entityManagementUI patterns
const ui = await createSeasonManagementUI({
  entityType: 'season',
  guildId: guildId,
  selectedId: season.id,
  activeFieldGroup: 'questions'
});
```

This architectural approach ensures the Season Application Builder integrates seamlessly with CastBot's existing patterns while providing a solid foundation for future enhancements.

## Product Backlog

### Future Enhancement: Dynamic Question Builder System
**Description:** Advanced application form creation with custom questions and automated data collection
**Priority:** High (increased from Medium due to DNC and Accommodations features)
**Status:** Requirements documented, ready for implementation

## Dynamic Question Builder System - Detailed Requirements

### Overview & User Experience Flow

The Dynamic Question Builder System enables server admins to create sophisticated, multi-step application processes with custom questions, automated data collection, and intelligent user experience flows. The system builds upon the architecture patterns described above, implementing the entity management approach for seasons and questions.

### Implementation Approach

The system follows the architectural patterns outlined in the [Architecture & Patterns](#architecture--patterns) section:
- Uses `entityManager` patterns for season/question CRUD operations
- Implements `editFramework` configurations for field management
- Follows `entityManagementUI` for consistent user interface
- Leverages existing Safari patterns for familiar admin experience

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

The technical implementation builds upon the patterns defined in the [Architecture & Patterns](#architecture--patterns) section and the data structures from the [Migration Strategy](#migration-strategy-bridging-current-and-future-designs) section.

#### Implementation Modules

Following the architectural patterns, the implementation includes:

**Core Modules:**
- **`seasonManager.js`**: Core season operations following Safari patterns
- **`seasonEntityManager.js`**: CRUD operations extending entityManager
- **`seasonManagementUI.js`**: UI components following entityManagementUI
- **`seasonQuestionBuilder.js`**: Question-specific logic and validation

**Specialized Modules:**
- **Enhanced `applicationManager.js`**: Extended for multi-step application flows
- **`dncConflictEngine.js`**: Real-time bidirectional conflict detection
- **`seasonAlertSystem.js`**: Admin notifications for DNC conflicts
- **`applicationFlowStateMachine.js`**: Manages application progression

#### Advanced Implementation Details

**DNC Conflict Detection Algorithm:**
```javascript
// Bidirectional conflict detection
async function detectDNCConflicts(guildId, applicationId) {
  const application = await loadApplication(guildId, applicationId);
  const allApplications = await loadSeasonApplications(guildId, application.seasonId);
  
  const conflicts = [];
  const userDNC = application.responses.q_dnc_001?.serverMembers || [];
  
  for (const otherApp of allApplications) {
    if (otherApp.id === applicationId) continue;
    
    const otherDNC = otherApp.responses.q_dnc_001?.serverMembers || [];
    
    // Check bidirectional conflicts
    const mutualDNC = userDNC.some(u => u.userId === otherApp.userId) && 
                      otherDNC.some(u => u.userId === application.userId);
    
    if (mutualDNC) {
      conflicts.push({
        conflictType: 'mutual',
        otherApplicant: otherApp.id,
        severity: 'high'
      });
    }
  }
  
  return conflicts;
}
```

**Question Type Registry:**
```javascript
// Extensible question type system
const QUESTION_HANDLERS = {
  text: TextQuestionHandler,
  profile: ProfileQuestionHandler,
  dnc: DNCQuestionHandler,
  accommodations: AccommodationsQuestionHandler
};

// Easy to add new question types
registerQuestionType('multiChoice', MultiChoiceQuestionHandler);
```

#### Question Configuration UI
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