# Season Application Builder

This document serves as the source of truth for the Season Application Builder feature in CastBot. Any updates, clarifications, or additional information about this feature should be documented here.

## Overview

### Overall Objectives

**For Server Admins:**
- Create dynamic, customizable application forms for each season/game without coding knowledge
- Streamline the player recruitment process with automated application collection
- Efficiently review, sort, and rank applicants through a unified dashboard
- Export application data for external analysis and decision-making
- Reduce manual work in managing prospective players

**For Applicants/Players:**
- Simple, intuitive application process directly within Discord
- Clear question presentation with various response types
- Progress tracking through multi-step applications
- Immediate submission confirmation
- Transparent application status updates

### Overall Solution Architecture

The Season Application Builder is designed as an extension of the Safari dynamic content management system, leveraging existing infrastructure while adding application-specific functionality.

**Key Architectural Components:**
1. **Safari Framework Integration**: Built on top of `safariManager.js` for button creation and dynamic content
2. **Entity Management**: Extends `entityManager.js` to support application entities with CRUD operations
3. **Edit Framework**: Utilizes `editFramework.js` for the universal editing interface
4. **Data Storage**: Applications stored in `safariContent.json`, responses in player-specific sections
5. **Modal-Based UI**: Sequential modal presentation for questions (Discord's 5-field limit per modal)
6. **Stateless Design**: Application progress tracked through custom_ids and temporary storage

**Technical Design Principles:**
- **Separation of Concerns**: Application data separate from core player data
- **Scalability**: Support for multiple concurrent applications per server
- **Reusability**: Shared components with other Safari features
- **Privacy**: Secure storage of applicant responses with admin-only access
- **Performance**: Efficient data retrieval and sorting for large applicant pools

### Alignment to Existing CastBot Features

**Integration Points:**
1. **Safari System**: Shares infrastructure with dynamic button creation and management
2. **Player Management**: Seamlessly transitions accepted applicants to player roster
3. **Cast Ranking**: Extends ranking functionality to applicant evaluation
4. **Role Management**: Automatic role assignment for accepted/rejected applicants
5. **Analytics**: Tracks application metrics through existing analytics system
6. **Production Menu**: Accessible through Safari submenu in production interface

**Consistent User Experience:**
- Follows established UI patterns from Safari buttons and player management
- Uses familiar Components V2 interface elements
- Maintains CastBot's admin permission model
- Integrates with existing help and documentation systems

## Product Backlog

### Core Application Management
**Functional Description:** Basic CRUD operations for creating and managing applications
**Technical Design:**
- Extend `entityManager.js` with application entity type
- Create `applicationBuilder.js` module for application-specific logic
- Storage structure in `safariContent.json`:
```json
{
  "applications": {
    "app_[timestamp]": {
      "name": "Season 3 Application",
      "description": "Apply to join our Survivor game!",
      "questions": [],
      "active": true,
      "createdBy": "userId",
      "createdAt": 1234567890,
      "channelId": "channelId"
    }
  }
}
```

**User Stories:**
- As an admin, I want to create a new application with a name and description
- As an admin, I want to edit existing applications
- As an admin, I want to activate/deactivate applications
- As an admin, I want to delete old applications

### Question Builder System
**Functional Description:** Dynamic question creation with multiple types and validation
**Technical Design:**
```javascript
const questionSchema = {
  id: "q_[timestamp]",
  text: "Question text",
  type: "paragraph|text|multiple_choice|rating|checkbox",
  required: true/false,
  order: 1,
  options: [], // for multiple_choice/checkbox
  validation: {
    minLength: 10,
    maxLength: 1000,
    pattern: "regex"
  }
}
```

**User Stories:**
- As an admin, I want to add questions of different types to my application
- As an admin, I want to reorder questions via drag-and-drop
- As an admin, I want to set questions as required or optional
- As an admin, I want to add validation rules to text questions
- As an admin, I want to preview how questions will appear to applicants

### Response Collection System
**Functional Description:** Capture and store applicant responses securely
**Technical Design:**
- Response storage in player data section:
```json
{
  "players": {
    "userId": {
      "applications": {
        "app_id": {
          "responses": {
            "q1": "answer",
            "q2": ["option1", "option2"]
          },
          "startedAt": 1234567890,
          "submittedAt": 1234567890,
          "status": "pending|accepted|rejected|waitlisted"
        }
      }
    }
  }
}
```

**User Stories:**
- As an applicant, I want to start an application and see progress
- As an applicant, I want to answer questions in a clear, sequential manner
- As an applicant, I want to review my answers before submitting
- As an applicant, I want confirmation that my application was received

### Admin Dashboard
**Functional Description:** Comprehensive interface for reviewing and managing applications
**Technical Design:**
- New module `applicationDashboard.js` for dashboard functionality
- Sortable/filterable table view with applicant data
- Bulk action support for status updates
- Integration with Discord embeds for display

**User Stories:**
- As an admin, I want to see all applications in a sortable table
- As an admin, I want to filter applications by status
- As an admin, I want to view individual application details
- As an admin, I want to bulk accept/reject applicants
- As an admin, I want to export application data to CSV

### Advanced Features (Future Consideration)
**Conditional Logic:**
- Show/hide questions based on previous answers
- Dynamic question text based on responses
- Skip logic for different application paths

**Auto-Scoring:**
- Point values for questions
- Automatic ranking based on responses
- Keyword matching for text responses

**Integration Features:**
- Webhook notifications for new applications
- Google Sheets export integration
- Discord role-based question visibility

**Templates:**
- Pre-built application templates
- Share templates between servers
- Template marketplace

## Releases (Release Backlog)

### Sprint 1: Core Infrastructure (Phase 1)
**Target:** Foundation for application system
**Features:**
- ✅ Extend entityManager.js for applications
- ✅ Create applicationBuilder.js module structure
- ✅ Basic application CRUD operations
- ✅ Safari menu integration for "📋 Manage Applications"
- ✅ Application creation modal flow
- ✅ List existing applications interface

### Sprint 2: Question Builder (Phase 2)
**Target:** Dynamic question creation and management
**Features:**
- ✅ Question type system implementation
- ✅ Add/Edit/Delete questions interface
- ✅ Question ordering functionality
- ✅ Question preview system
- ✅ Validation rules for text questions
- ✅ Post application button to channel

### Sprint 3: Player Experience (Phase 3)
**Target:** Complete applicant flow
**Features:**
- ✅ Sequential modal question presentation
- ✅ Response validation and error handling
- ✅ Progress tracking between questions
- ✅ Response storage system
- ✅ Submission confirmation message
- ✅ Application status checking

### Sprint 4: Admin Dashboard (Phase 4)
**Target:** Application review and management
**Features:**
- ✅ Basic application listing interface
- ✅ Individual application view
- ✅ Status update functionality
- ✅ Filter by application status
- ✅ Sort by submission date
- ✅ Basic export to CSV

### Sprint 5: Enhanced Features (Phase 5)
**Target:** Quality of life improvements
**Features:**
- Bulk status updates
- Advanced filtering options
- Response search functionality
- Application analytics
- Email notification integration
- Role assignment automation

## As-Built Deployment

*Currently no features have been deployed to production. Features will be moved here as they are completed and released.*

---

## Implementation Notes

### Discord Limitations to Consider
- Modal fields limited to 5 per interaction
- String select menus limited to 25 options
- Button rows limited to 5 per message
- Custom ID length limited to 100 characters
- Embed description limited to 4096 characters

### Security Considerations
- All admin functions require ManageRoles permission
- Application responses stored with user privacy in mind
- Export functionality restricted to server admins
- Rate limiting on application submissions

### Performance Considerations
- Pagination for large application lists
- Efficient data structures for sorting/filtering
- Caching for frequently accessed application data
- Background processing for bulk operations

### Future Architecture Decisions
- Consider moving to database storage for large-scale deployments
- Implement application versioning for question changes
- Add application analytics and insights
- Create application template system