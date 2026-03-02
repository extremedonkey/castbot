# Cast Ranking System

**Version:** 2.0  
**Status:** ✅ Production Ready  
**Dependencies:** Season Applications, Components V2, Button Handler Factory  
**Permissions:** Admin (ManageRoles, ManageChannels, ManageGuild, Administrator)

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture & Data Structure](#architecture--data-structure)
3. [Season Applications Integration](#season-applications-integration)
4. [Core Features](#core-features)
5. [User Interface Components](#user-interface-components)
6. [Data Flow & Processing](#data-flow--processing)
7. [Technical Implementation](#technical-implementation)
8. [Permission System](#permission-system)
9. [API Reference](#api-reference)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Cast Ranking system is a comprehensive applicant evaluation and casting management platform built on top of the Season Applications framework. It provides admins with powerful tools to:

- **Score applicants** on a 1-5 scale with individual voting
- **Track casting decisions** with visual status management
- **Record detailed notes** about applicants and their backgrounds
- **View comprehensive analytics** with voting breakdowns and summaries
- **Navigate efficiently** through multiple applicants

### Key Benefits

- **Democratic Decision Making**: Multiple admins can vote independently
- **Transparent Process**: Complete voting breakdowns and analytics
- **Organized Workflow**: Structured navigation and status tracking
- **Persistent Records**: Comprehensive note-taking and data retention
- **Visual Interface**: Intuitive Discord Components V2 interface

---

## Architecture & Data Structure

### Data Storage Model

Cast Ranking extends the Season Applications data structure in `playerData.json`:

```json
{
  "guildId": {
    "applications": {
      "channelId1": {
        "userId": "391415444084490240",
        "displayName": "John Doe",
        "username": "johndoe",
        "avatarURL": "https://cdn.discordapp.com/avatars/...",
        "castingStatus": "cast",           // NEW: cast/tentative/reject
        "playerNotes": "Great player..."   // NEW: Admin notes
      }
    },
    "rankings": {                          // NEW: Voting system
      "channelId1": {
        "adminUserId1": 5,                 // Scores 1-5
        "adminUserId2": 4,
        "adminUserId3": 3
      }
    }
  }
}
```

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cast Ranking System                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   Scoring       │  │   Casting       │  │    Notes     │ │
│  │   System        │  │   Management    │  │   System     │ │
│  │                 │  │                 │  │              │ │
│  │ • 1-5 Rating    │  │ • Cast Player   │  │ • Modal Edit │ │
│  │ • Multi-voter   │  │ • Tentative     │  │ • Rich Text  │ │
│  │ • Analytics     │  │ • Don't Cast    │  │ • Persistent │ │
│  │ • Breakdowns    │  │ • Visual Status │  │ • Searchable │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                   Season Applications                       │
│              (Base applicant data & channels)               │
└─────────────────────────────────────────────────────────────┘
```

---

## Season Applications Integration

### Data Relationship

Cast Ranking is built as an **overlay system** on Season Applications:

1. **Season Applications** provides:
   - Base applicant data (userId, displayName, etc.)
   - Application channel structure
   - User management and application flow

2. **Cast Ranking** adds:
   - Scoring/voting layer (`rankings` node)
   - Casting decisions (`castingStatus` field)
   - Administrative notes (`playerNotes` field)

### Channel ID as Primary Key

Both systems use **application channel IDs** as the primary relationship key:

```javascript
// Season Application creates:
playerData[guildId].applications[channelId] = {
  userId: "391415444084490240",
  displayName: "John Doe",
  // ... base data
}

// Cast Ranking extends:
playerData[guildId].applications[channelId].castingStatus = "cast";
playerData[guildId].applications[channelId].playerNotes = "Notes...";
playerData[guildId].rankings[channelId] = {
  "adminId1": 5,
  "adminId2": 4
};
```

### Workflow Integration

```
Season Applications Flow:
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Applies  │ →  │  Channel Created │ →  │  Data Stored    │
│   via Form      │    │  for Application │    │  in playerData  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        ↓
Cast Ranking Flow:                                      ↓
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Admin Opens    │ ←  │  Ranking Interface │ ←  │  Access via     │
│  Cast Ranking   │    │  with Voting/Notes │    │  Season Menu    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## Core Features

### 1. Individual Scoring System

**Purpose**: Democratic voting system where each admin rates applicants independently

**Mechanism**:
- 5-point scale (1 = lowest, 5 = highest)
- Individual votes stored per admin
- Real-time average calculation
- Visual feedback for current user's vote

**Data Structure**:
```javascript
rankings[guildId][channelId][adminUserId] = score (1-5)
```

**UI Behavior**:
- Current user's vote highlighted in green
- Disabled button for selected score
- Average shown with vote count
- Instant updates on selection

### 2. Casting Status Management

**Purpose**: Track final casting decisions with visual status indicators

**Status Types**:
- **Cast** (✅): Player selected for the season
- **Tentative** (❓): Under consideration/backup option  
- **Don't Cast** (🗑️): Player rejected
- **Undecided** (⚪): No decision made (default)

**Visual System**:
- **Green button**: Cast Player (when selected)
- **Blue button**: Tentative (when selected)
- **Red button**: Don't Cast (when selected)
- **Grey buttons**: Inactive/unselected states

**Exclusivity**: Only one status can be active per applicant

### 3. Player Notes System

**Purpose**: Comprehensive note-taking for casting decisions

**Features**:
- **Rich text support**: 2000 character limit
- **Modal editing**: Clean, focused editing experience
- **Persistent storage**: Notes survive navigation and restarts
- **Live updates**: Changes appear immediately in interface
- **Default guidance**: Helpful placeholder text

**Use Cases**:
- Record player connections and relationships
- Note potential issues from other servers
- Track casting discussions and decisions
- Document player strengths and weaknesses

### 4. Voting Breakdown Analytics

**Purpose**: Transparent view of all individual votes

**Display Format**:
```
### 🗳️ Votes
> Average: 4.2/5.0 (3 votes)
• @Admin1: ⭐⭐⭐⭐⭐ (5/5)
• @Admin2: ⭐⭐⭐⭐ (4/5)
• @Admin3: ⭐⭐⭐ (3/5)
```

**Features**:
- **Ordered display**: Highest scores first
- **Visual stars**: Easy score recognition
- **Admin attribution**: Shows who voted what
- **Conditional rendering**: Only appears when votes exist

### 5. Quick Navigation System

**Purpose**: Efficient navigation through large applicant pools via String Select dropdown

**Features**:
- **Direct jumping**: Select any applicant from dropdown menu
- **Smart pagination**: Handles 25+ applicants with page navigation
- **Visual indicators**: Icons show casting status and vote count
- **Notes indicator**: 💬 shows which applicants have notes
- **Maintains state**: Preserves current page and navigation context

**Implementation**: See [Cast Ranking Navigation](CastRankingNavigation.md) for detailed documentation

### 6. Comprehensive Overview

**Purpose**: High-level summary of all applicants organized by casting status

**Organization**:
- **✅ CAST PLAYERS**: Green section with top performers
- **❓ TENTATIVE**: Blue section for consideration
- **🗑️ DON'T CAST**: Red section for rejected applicants
- **⚪ UNDECIDED**: Grey section for unprocessed applicants

**Metrics**:
- Total applicants count
- Status distribution (cast/tentative/rejected/undecided)
- Scoring completion rate
- Individual rankings within each status group

---

## User Interface Components

### Main Ranking Interface

```
## Cast Ranking | Server Name
─────────────────────────────────────

> Applicant 2 of 5
Name: John Doe
Average Score: 4.2/5.0 (3 votes)
Your Score: 5
Casting Status: ✅ Cast
App: #john-doe-application

[Applicant Avatar]

> Rate this applicant (1-5):
[ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 🟢 5 ]

─────────────────────────────────────

[ 🎬 Cast Player ] [ ❓ Tentative ] [ 🗑️ Don't Cast ]

─────────────────────────────────────

[ ◀ Previous ] [ Next ▶ ] [ 📊 View All Scores ]

─────────────────────────────────────

### 🗳️ Votes
> Average: 4.2/5.0 (3 votes)
• @Admin1: ⭐⭐⭐⭐⭐ (5/5)
• @Admin2: ⭐⭐⭐⭐ (4/5)
• @Admin3: ⭐⭐⭐ (3/5)

─────────────────────────────────────

### ✏️ Player Notes
Great player with strong social game. Knows 
several current players from previous seasons.
Recommended by trusted sources.

[ ✏️ Edit Player Notes ]
```

### Component Breakdown

#### 1. Header Section
- **Guild branding**: Server name integration
- **Progress indicator**: "Applicant X of Y"
- **Applicant summary**: Name, scores, status, channel link

#### 2. Avatar Display
- **Media Gallery component**: High-resolution applicant avatar
- **Fallback system**: Default avatars for missing images
- **CDN optimization**: Preloaded for performance

#### 3. Scoring Interface
- **5 interactive buttons**: Number labels (1-5)
- **Visual feedback**: Green for selected, grey for unselected
- **State management**: Disabled for current selection
- **Real-time updates**: Instant score recording

#### 4. Casting Management
- **3 status buttons**: Cast, Tentative, Don't Cast
- **Color coding**: Green/Blue/Red based on selection
- **Exclusive selection**: Only one active at a time
- **Visual hierarchy**: Clear status indication

#### 5. Navigation Controls
- **Previous/Next**: Disabled at boundaries
- **View All Scores**: Comprehensive overview access
- **Context preservation**: Maintains state across navigation

#### 6. Analytics Section
- **Conditional display**: Only when votes exist
- **Ordered presentation**: Highest scores first
- **Visual enhancement**: Star ratings for readability
- **Admin attribution**: Clear vote ownership

#### 7. Notes Management
- **Rich text display**: Formatted note presentation
- **Edit button**: Modal access for updates
- **Default guidance**: Helpful placeholder content
- **Live updates**: Immediate interface refresh

---

## Data Flow & Processing

### Vote Recording Flow

```
User Clicks Score Button (1-5)
           ↓
Permission Check (Admin Required)
           ↓
Parse Button Data (score, channelId, appIndex)
           ↓
Load Player Data from JSON
           ↓
Update: playerData[guildId].rankings[channelId][userId] = score
           ↓
Save Player Data to JSON
           ↓
Recalculate Average Score
           ↓
Regenerate Interface with Updated Data
           ↓
Send UPDATE_MESSAGE Response
```

### Casting Status Flow

```
User Clicks Casting Button (Cast/Tentative/Reject)
           ↓
Permission Check (Admin Required)
           ↓
Parse Button Data (status, channelId, appIndex)
           ↓
Load Player Data from JSON
           ↓
Map Status: player→cast, tentative→tentative, reject→reject
           ↓
Update: playerData[guildId].applications[channelId].castingStatus
           ↓
Save Player Data to JSON
           ↓
Regenerate Interface with Updated Button States
           ↓
Send UPDATE_MESSAGE Response
```

### Notes Update Flow

```
User Clicks Edit Notes Button
           ↓
Permission Check (Admin Required)
           ↓
Load Existing Notes from playerData
           ↓
Generate Modal with Pre-filled Content
           ↓
Send MODAL Response
           ↓
User Submits Modal
           ↓
Process Modal Submission
           ↓
Update: playerData[guildId].applications[channelId].playerNotes
           ↓
Save Player Data to JSON
           ↓
Regenerate Complete Interface
           ↓
Send UPDATE_MESSAGE Response
```

### Navigation Flow

```
User Clicks Previous/Next
           ↓
Permission Check (Admin Required)
           ↓
Calculate New Application Index
           ↓
Validate Index Boundaries
           ↓
Load Application Data for New Index
           ↓
Fetch Applicant Member Data
           ↓
Generate Complete Interface for New Applicant
           ↓
Send UPDATE_MESSAGE Response
```

---

## Technical Implementation

### Core Functions

#### 1. `createVotingBreakdown(channelId, playerData, guildId, guild)`
**Purpose**: Generate individual voting display component

```javascript
async function createVotingBreakdown(channelId, playerData, guildId, guild) {
  const allRankings = playerData[guildId]?.rankings?.[channelId] || {};
  const rankingEntries = Object.entries(allRankings).filter(([_, score]) => score !== undefined);
  
  if (rankingEntries.length === 0) return null;
  
  // Sort by score (highest to lowest)
  rankingEntries.sort(([_a, scoreA], [_b, scoreB]) => scoreB - scoreA);
  
  // Calculate average and build display
  const scores = rankingEntries.map(([_, score]) => score);
  const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  
  let votingText = `### :ballot_box: Votes\n> **Average:** ${avgScore}/5.0 (${scores.length} vote${scores.length !== 1 ? 's' : ''})\n`;
  
  // Fetch member names and build vote list
  for (const [userId, score] of rankingEntries) {
    const member = await guild.members.fetch(userId);
    const displayName = member.displayName || member.user.username;
    const stars = ':star:'.repeat(score);
    votingText += `• @${displayName}: ${stars} (${score}/5)\n`;
  }
  
  return { type: 10, content: votingText };
}
```

#### 2. `createCastingButtons(channelId, appIndex, playerData, guildId)`
**Purpose**: Generate casting status button row with proper states

```javascript
function createCastingButtons(channelId, appIndex, playerData, guildId) {
  const castingStatus = playerData[guildId]?.applications?.[channelId]?.castingStatus;
  
  const castButtons = [
    new ButtonBuilder()
      .setCustomId(`cast_player_${channelId}_${appIndex}`)
      .setLabel('🎬 Cast Player')
      .setStyle(castingStatus === 'cast' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cast_tentative_${channelId}_${appIndex}`)
      .setLabel('❓ Tentative')
      .setStyle(castingStatus === 'tentative' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cast_reject_${channelId}_${appIndex}`)
      .setLabel('🗑️ Don\'t Cast')
      .setStyle(castingStatus === 'reject' ? ButtonStyle.Danger : ButtonStyle.Secondary)
  ];
  
  return new ActionRowBuilder().addComponents(castButtons);
}
```

#### 3. `createPlayerNotesSection(channelId, appIndex, playerData, guildId)`
**Purpose**: Generate notes display and edit button

```javascript
function createPlayerNotesSection(channelId, appIndex, playerData, guildId) {
  const existingNotes = playerData[guildId]?.applications?.[channelId]?.playerNotes;
  const notesText = existingNotes || 'Record casting notes, connections or potential issues...';
  
  const notesDisplay = {
    type: 10, // Text Display component
    content: `### :pencil: Player Notes\n${notesText}`
  };
  
  const editButton = new ButtonBuilder()
    .setCustomId(`edit_player_notes_${channelId}_${appIndex}`)
    .setLabel('✏️ Edit Player Notes')
    .setStyle(ButtonStyle.Primary);
  
  const editButtonRow = new ActionRowBuilder().addComponents(editButton);
  
  return [notesDisplay, editButtonRow.toJSON()];
}
```

### Button Handlers

#### 1. Ranking Buttons (`rank_1_`, `rank_2_`, etc.)
**Handler**: `app.js:4288`
**Permissions**: Admin (ManageRoles/ManageChannels/ManageGuild)
**Response**: UPDATE_MESSAGE with regenerated interface

#### 2. Casting Buttons (`cast_player_`, `cast_tentative_`, `cast_reject_`)
**Handler**: `app.js:4940`
**Permissions**: Admin (ManageRoles/ManageChannels/ManageGuild)
**Response**: UPDATE_MESSAGE with updated status colors

#### 3. Navigation Buttons (`ranking_prev_`, `ranking_next_`)
**Handler**: `app.js:4621`
**Permissions**: Admin (ManageRoles/ManageChannels/ManageGuild)
**Response**: UPDATE_MESSAGE with new applicant interface

#### 4. Edit Notes Button (`edit_player_notes_`)
**Handler**: `app.js:5159`
**Permissions**: Admin (ManageRoles/ManageChannels/ManageGuild)
**Response**: MODAL with pre-filled notes

#### 5. Notes Modal Submission (`save_player_notes_`)
**Handler**: `app.js:22766`
**Response**: UPDATE_MESSAGE with updated notes display

### Error Handling

```javascript
try {
  // Button/modal processing logic
} catch (error) {
  console.error('Error in cast ranking:', error);
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: '❌ Error processing request. Please try again.',
      flags: InteractionResponseFlags.EPHEMERAL
    }
  });
}
```

---

## Permission System

### Supported Permissions

Cast Ranking uses **inclusive admin permissions** - users need **ANY** of these:

- ✅ **Manage Roles** (`PermissionFlagsBits.ManageRoles`)
- ✅ **Manage Channels** (`PermissionFlagsBits.ManageChannels`)
- ✅ **Manage Server** (`PermissionFlagsBits.ManageGuild`)
- ✅ **Administrator** (`PermissionFlagsBits.Administrator`)

### Implementation Pattern

```javascript
// Using requireAdminPermission utility
if (!requireAdminPermission(req, res, 'Custom error message')) return;

// Direct permission checking (alternative pattern)
if (!member.permissions.has(PermissionFlagsBits.ManageRoles) && 
    !member.permissions.has(PermissionFlagsBits.ManageChannels) && 
    !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
  return res.send({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: '❌ You need admin permissions to use this feature.',
      flags: InteractionResponseFlags.EPHEMERAL
    }
  });
}
```

### Consistency Across Features

| Feature | Permission Check |
|---------|------------------|
| Main Interface | ✅ Admin (Multiple) |
| Scoring (1-5) | ✅ Admin (Multiple) |
| Casting Status | ✅ Admin (Multiple) |
| Player Notes | ✅ Admin (Multiple) |
| Navigation | ✅ Admin (Multiple) |
| View All Scores | ✅ Admin (Multiple) |

---

## API Reference

### Entry Point

**Button ID**: `season_app_ranking`  
**Handler**: `app.js:6322`  
**Access**: Production Menu → Season Applications → Cast Ranking  
**Permissions**: Admin required

### Data Access Functions

#### `getAllApplicationsFromData(guildId)`
**Purpose**: Retrieve all application data for ranking
**Returns**: Array of application objects
**Usage**: Main interface and navigation

#### `loadPlayerData()` / `savePlayerData(data)`
**Purpose**: Core data persistence functions
**Location**: `storage.js`
**Usage**: All data operations

### Button Handler Registry

```javascript
// buttonHandlerFactory.js
'season_app_ranking': {
  label: 'Cast Ranking',
  description: 'Comprehensive applicant ranking and evaluation system',
  emoji: '🏆',
  style: 'Secondary',
  category: 'application_management'
},

'cast_player_*': {
  label: 'Cast Player',
  description: 'Mark applicant as cast',
  emoji: '🎬',
  style: 'Secondary',
  category: 'casting_management'
},

'edit_player_notes_*': {
  label: 'Edit Player Notes',
  description: 'Add or update casting notes for applicant',
  emoji: '✏️',
  style: 'Primary',
  category: 'casting_management'
}
```

---

## Troubleshooting

### Common Issues

#### 1. "This interaction failed" Errors

**Symptoms**: Button clicks result in immediate failure
**Common Causes**:
- Missing permissions check
- Malformed emoji characters
- Complex UI in simple contexts
- UPDATE_MESSAGE with incompatible flags

**Solutions**:
- Verify admin permissions
- Check button handler logs
- Use Components V2 patterns
- Ensure proper response types

#### 2. Casting Buttons Disappearing

**Symptoms**: Buttons vanish after ranking interactions
**Cause**: Handler not including casting buttons in regenerated UI
**Solution**: Ensure all handlers call `createCastingButtons()`

```javascript
// ✅ Correct pattern
containerComponents.push(
  createCastingButtons(currentApp.channelId, appIndex, playerData, guildId).toJSON()
);
```

#### 3. Notes Not Updating

**Symptoms**: Modal saves but interface doesn't refresh
**Cause**: Modal handler sending wrong response type
**Solution**: Use UPDATE_MESSAGE instead of success message

```javascript
// ❌ Wrong - shows success message
return res.send({
  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
  data: { content: 'Success!', flags: InteractionResponseFlags.EPHEMERAL }
});

// ✅ Correct - updates interface
return res.send({
  type: InteractionResponseType.UPDATE_MESSAGE,
  data: { flags: (1 << 15), components: [container] }
});
```

#### 4. Permission Denied Errors

**Symptoms**: Users with ManageChannels getting denied
**Cause**: Handler using single permission check
**Solution**: Use `requireAdminPermission()` or multiple permission pattern

#### 5. Data Persistence Issues

**Symptoms**: Votes/notes not saving between sessions
**Cause**: Data not being properly saved to playerData.json
**Solution**: Verify `savePlayerData()` calls after all updates

### Debugging Tools

#### 1. Enable Debug Logging
```javascript
console.log('🔍 DEBUG: Processing ranking button:', custom_id);
console.log('🔍 DEBUG: Player data:', JSON.stringify(playerData, null, 2));
```

#### 2. Check Data Structure
```bash
# View current player data
cat playerData.json | jq '.["guildId"].applications'
cat playerData.json | jq '.["guildId"].rankings'
```

#### 3. Verify Button Registration
```javascript
// Check if button is in registry
console.log('Button registry entry:', BUTTON_REGISTRY['season_app_ranking']);
```

### Performance Considerations

#### 1. Avatar CDN Optimization
- Pre-fetch avatars to warm Discord CDN cache
- Use HEAD requests to check URL readiness
- Implement fallback for missing avatars

#### 2. Data Loading Efficiency
- Load player data once per interaction
- Cache application data during navigation
- Minimize repeated database queries

#### 3. Interface Generation
- Reuse component builders where possible
- Batch button creation operations
- Optimize container component arrays

---

## Future Enhancements

### Planned Features

1. **Bulk Operations**
   - Multi-select casting decisions
   - Batch note updates
   - Mass score adjustments

2. **Advanced Analytics**
   - Score distribution graphs
   - Voting pattern analysis
   - Historical casting trends

3. **Export Functionality**
   - CSV/Excel export of scores
   - PDF casting reports
   - Integration with external tools

4. **Notification System**
   - Score threshold alerts
   - Casting decision notifications
   - Weekly summary reports

### Integration Opportunities

1. **Calendar Integration**
   - Casting deadline tracking
   - Season timeline management
   - Automated reminders

2. **External APIs**
   - Discord server verification
   - Player history lookup
   - Social media integration

3. **Advanced Permissions**
   - Role-based voting weights
   - Hierarchical approval systems
   - Audit trail management

---

## Support & Resources

**Primary Documentation**: [Season Application Builder](SeasonAppBuilder.md)  
**Architecture Reference**: [Components V2](../architecture/ComponentsV2.md)  
**Button System**: [Button Handler Factory](../architecture/ButtonHandlerFactory.md)  
**Permission Utilities**: [Permission Utils](../../utils/permissionUtils.js)

**File Locations**:
- Main handlers: `app.js:4288-5200, 6322-6750, 22766-23000`
- Helper functions: `app.js:431-533`
- Button registry: `buttonHandlerFactory.js:755-789`
- Data storage: `storage.js`, `playerData.json`

**Debugging**: Enable console logging and check `npm run logs-prod` for production issues.

---

*Last Updated: January 2025*  
*Version: 2.0*  
*Maintained by: CastBot Development Team*