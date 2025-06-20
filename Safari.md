# Safari.md - CastBot Dynamic Content Management System

## 📋 Table of Contents
1. [Overview](#overview)
2. [Core Features](#core-features)
3. [Architecture](#architecture)
4. [Data Structures](#data-structures)
5. [MVP Releases](#mvp-releases)
6. [UI/UX Design](#uiux-design)
7. [Technical Implementation](#technical-implementation)
8. [Test Cases](#test-cases)
9. [Deployment Guide](#deployment-guide)

## Overview

The Safari system is CastBot's dynamic content management framework that enables Discord server administrators to create interactive, button-driven experiences for their players. This system powers two major features:

### 🦁 Safari Builder
Interactive adventures where players navigate through host-created content, make choices, earn/spend currency, and engage with dynamic storylines. Think of it as a "choose your own adventure" system built entirely within Discord.

### 📝 Season Application Builder
Dynamic application processes where hosts define custom questions and collect structured responses from prospective players, replacing static forms with interactive Discord-native experiences.

## Core Features

### Shared Foundation
Both features leverage the same technical infrastructure:
- **Dynamic Component Creation**: Hosts can create custom Discord Components V2 interfaces
- **Content Management**: Store and retrieve host-defined content, questions, and player responses
- **State Tracking**: Monitor player progress, choices, and interactions
- **Currency System**: Track and manage virtual currencies (Safari-specific)
- **Modular Actions**: Chainable actions that can display content, modify state, or trigger follow-ups

### Design Principles
1. **Reusability**: Core functionality supports multiple use cases
2. **Lean MVP**: Start simple, architect for growth
3. **CastBot Alignment**: Uses existing UI patterns (Container components, production menu structure)
4. **Data Safety**: New features don't compromise existing playerData.json

## Architecture

### File Structure
```
/castbot
├── safariManager.js        # Core safari functionality
├── safariContent.json      # Button/content definitions
├── Safari.md              # This documentation
├── app.js                 # Button handler integration
└── playerData.json        # Extended with safari fields
```

### Module Responsibilities

#### safariManager.js
- Button creation and management
- Action execution engine
- Currency operations
- Content retrieval and storage
- State management

#### Data Storage Strategy
- **safariContent.json**: All host-created content (buttons, actions, text)
- **playerData.json**: Only player-specific data (currency, history)
- Separation prevents corruption of critical player data

### Security Model
- Admin-only content creation (ManageRoles permission)
- Player interactions logged via analyticsLogger
- Rate limiting on currency actions
- Audit trail for all safari modifications

## Data Structures

### safariContent.json
```json
{
  "guildId": {
    "buttons": {
      "unique_button_id": {
        "id": "unique_button_id",
        "label": "Start Adventure",
        "emoji": "🗺️",
        "style": "Primary",
        "actions": [
          {
            "type": "display_text",
            "order": 1,
            "config": {
              "title": "Welcome to the Safari!",
              "content": "Your adventure begins...",
              "accentColor": 3447003
            }
          },
          {
            "type": "update_currency",
            "order": 2,
            "config": {
              "amount": 100,
              "message": "You received 100 coins!"
            }
          },
          {
            "type": "follow_up_button",
            "order": 3,
            "config": {
              "buttonId": "first_choice",
              "replaceMessage": false
            }
          }
        ],
        "metadata": {
          "createdBy": "userId",
          "createdAt": 1703001234567,
          "lastModified": 1703001234567,
          "usageCount": 0,
          "tags": ["intro", "safari1"]
        }
      }
    },
    "safaris": {
      "safari_id": {
        "name": "Jungle Adventure",
        "description": "Explore the mystical jungle",
        "startButtonId": "unique_button_id",
        "active": true,
        "createdAt": 1703001234567
      }
    },
    "applications": {
      "app_id": {
        "name": "Season 3 Application",
        "questions": [
          {
            "id": "q1",
            "text": "Why do you want to play Survivor?",
            "type": "paragraph",
            "required": true,
            "order": 1
          }
        ],
        "active": true,
        "responses": {}
      }
    }
  }
}
```

### playerData.json Extension
```json
{
  "guildId": {
    "players": {
      "userId": {
        "/* existing fields */": "...",
        "safari": {
          "currency": 1000,
          "history": ["button1", "button2"],
          "lastInteraction": 1703001234567,
          "achievements": ["first_steps"],
          "inventory": {}
        },
        "applications": {
          "app_id": {
            "responses": {
              "q1": "I love strategy games...",
              "q2": "My timezone is EST..."
            },
            "submittedAt": 1703001234567,
            "status": "pending"
          }
        }
      }
    }
  }
}
```

## MVP Releases

### MVP1 - Core Button System (Target: 3-4 hours)
**Features:**
- Safari submenu in Production Menu
- Create Custom Button interface
- Three action types:
  - `display_text`: Show formatted content
  - `update_currency`: Modify player currency
  - `follow_up_button`: Chain interactions
- Post button to channel
- Basic currency display

**Implementation:**
1. Create safariManager.js with core functions
2. Add Safari submenu to production menu
3. Implement button creation flow
4. Add button handler to app.js
5. Test with simple safari scenario

### MVP2 - Enhanced Actions (Future: Week 1)
**Features:**
- Conditional actions (if currency >= X)
- Shop system (buy/sell items)
- Random outcomes
- Button cooldowns/limits
- Import/export safari templates
- Basic analytics dashboard

### MVP3 - Application Builder (Future: Week 2)
**Features:**
- Question management interface
- Response collection system
- Application status tracking
- Export responses to CSV
- Integration with cast ranking

### MVP4 - Advanced Features (Future: Month 1)
**Features:**
- Visual map editor (upload image, auto-grid)
- Complex condition builder
- Multiplayer interactions
- Leaderboards and achievements
- Scheduled events/time-based actions

## UI/UX Design

### Production Menu Integration
```
📋 Production Menu
├── 🦁 Safari
│   ├── 📝 Create Custom Button
│   ├── 📤 Post Custom Button
│   ├── 💰 Manage Currency
│   ├── 📊 View All Buttons
│   └── ⬅ Back to Menu
```

### Button Creation Flow

#### Step 1: Initial Modal
```
Title: Create Custom Button
Fields:
- Button Label (max 80 chars)
- Emoji (emoji picker)
- Style (dropdown: Primary/Secondary/Success/Danger)
- Button ID (auto-generated, editable)
```

#### Step 2: Action Menu
```
Container Component:
[Text Display] Choose actions for your button (max 5)
[Buttons Row 1]
  - 📄 Add Text Display
  - 💰 Add Currency Change
  - 🔗 Add Follow-up Button
[Buttons Row 2]  
  - ✅ Save Button
  - ❌ Cancel
```

#### Step 3: Action Configuration
Each action type has specific configuration:

**Display Text Modal:**
- Title (optional, max 100 chars)
- Content (required, max 2000 chars)
- Accent Color (color picker or hex)

**Currency Change Modal:**
- Amount (-999999 to 999999)
- Notification Message (max 200 chars)
- Show Current Balance (checkbox)

**Follow-up Button Select:**
- Dropdown of existing buttons
- Delay in seconds (0-60)
- Replace current message (checkbox)

### Player Experience

#### Safari Interaction
```
[Container: Accent Color #3498db]
  [Text Display]
    # Welcome to the Jungle Safari!
    You stand at the entrance to a dense jungle...
  [Separator]
  [Text Display]
    💰 Your coins: 1,000
  [Action Row]
    [🌿 Enter Jungle] [🏘️ Return to Village]
```

#### Currency Update
```
[Ephemeral Message]
  ✅ You found a treasure chest!
  +500 coins (Total: 1,500)
```

## Technical Implementation

### Custom ID Pattern
```
safari_{guildId}_{buttonId}_{timestamp}
Example: safari_123456789_start_adventure_1703001234567
```

### Core Functions

#### safariManager.js
```javascript
// Button Management
async function createCustomButton(guildId, buttonData, userId)
async function updateCustomButton(guildId, buttonId, updates)
async function deleteCustomButton(guildId, buttonId)
async function getCustomButton(guildId, buttonId)
async function listCustomButtons(guildId, filters)

// Action Execution
async function executeButtonActions(guildId, buttonId, userId, interaction)
async function executeDisplayText(config, interaction)
async function executeUpdateCurrency(config, userId, guildId, interaction)
async function executeFollowUpButton(config, interaction)

// Currency Management  
async function getCurrency(guildId, userId)
async function updateCurrency(guildId, userId, amount)
async function setCurrency(guildId, userId, amount)

// Safari Management
async function createSafari(guildId, safariData)
async function postButtonToChannel(guildId, buttonId, channelId, client)
```

### Button Handler Integration (app.js)
```javascript
} else if (custom_id.startsWith('safari_')) {
    const [, guildId, buttonId, timestamp] = custom_id.split('_');
    
    // Import and execute safari actions
    const { executeButtonActions } = await import('./safariManager.js');
    const result = await executeButtonActions(guildId, buttonId, userId, req.body);
    
    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: result
    });
}
```

### Action Execution Pipeline
```javascript
async function executeButtonActions(guildId, buttonId, userId, interaction) {
    const button = await getCustomButton(guildId, buttonId);
    if (!button) throw new Error('Button not found');
    
    const results = [];
    
    // Sort actions by order
    const sortedActions = button.actions.sort((a, b) => a.order - b.order);
    
    for (const action of sortedActions) {
        switch (action.type) {
            case 'display_text':
                results.push(await executeDisplayText(action.config, interaction));
                break;
            case 'update_currency':
                results.push(await executeUpdateCurrency(action.config, userId, guildId, interaction));
                break;
            case 'follow_up_button':
                results.push(await executeFollowUpButton(action.config, interaction));
                break;
        }
    }
    
    // Combine results into single response
    return combineActionResults(results);
}
```

## Test Cases

### MVP1 Test Scenarios

#### Test 1: Basic Button Creation
1. Admin opens Production Menu
2. Clicks Safari → Create Custom Button
3. Fills in: "Start Adventure", 🗺️, Primary
4. Adds display_text action
5. Saves button
6. Verify button appears in "View All Buttons"

#### Test 2: Currency Flow
1. Create button with +100 currency action
2. Post to test channel
3. Player clicks button
4. Verify currency increases
5. Check playerData.json updated correctly

#### Test 3: Action Chain
1. Create Button A with follow-up to Button B
2. Button B has display_text
3. Player clicks Button A
4. Verify Button B appears
5. Click Button B, verify text displays

#### Test 4: Error Handling
1. Try creating button without label
2. Try negative currency below 0
3. Try follow-up to non-existent button
4. Verify appropriate error messages

### Security Tests
- Non-admin cannot access Safari menu
- Custom IDs cannot be tampered
- Currency cannot go negative
- Rate limiting prevents spam

## Deployment Guide

### Pre-Deployment Checklist
- [ ] Create safariContent.json with empty structure
- [ ] Backup playerData.json
- [ ] Test in development environment
- [ ] Update CLAUDE.md with Safari.md reference
- [ ] Document in BUTTON_HANDLER_REGISTRY.md

### Deployment Steps

1. **Development Testing**
   ```bash
   ./dev-restart.sh "Add Safari dynamic content system MVP1"
   ```

2. **Verify Core Functionality**
   - Create test button
   - Execute all action types
   - Check data persistence

3. **Production Deployment**
   ```bash
   npm run deploy-remote-wsl
   ```

4. **Post-Deployment**
   - Monitor logs for errors
   - Create announcement for admins
   - Provide tutorial/examples

### Rollback Plan
1. Remove safari handler from app.js
2. Remove Safari submenu from production menu
3. Keep data files (no data loss)
4. Investigate issues before re-deployment

## Future Enhancements

### Phase 2 Features
- **Conditional Logic**: If/else based on currency, inventory, history
- **Shop System**: Buy/sell items with currency
- **Random Outcomes**: Dice rolls, loot tables
- **Timed Events**: Actions that expire or unlock over time

### Phase 3 Features  
- **Visual Map Editor**: Upload image, auto-create grid navigation
- **Multiplayer**: See other players, trade, compete
- **Achievements**: Unlock rewards for completing safaris
- **Analytics**: Track player paths, popular choices

### Integration Opportunities
- **Cast Ranking**: Safari completion affects application score
- **Season Themes**: Safaris as pre-season challenges
- **Tribal Competitions**: Team-based safari challenges

## Appendix: Component Examples

### Display Text Component
```json
{
  "flags": 32768,
  "components": [{
    "type": 17,
    "accent_color": 3447003,
    "components": [
      {
        "type": 10,
        "content": "# The Mysterious Cave\n\nYou discover a cave entrance..."
      },
      {
        "type": 14
      },
      {
        "type": 1,
        "components": [{
          "type": 2,
          "custom_id": "safari_123_explore_cave_1703001234",
          "label": "Enter the Cave",
          "style": 1,
          "emoji": { "name": "🕳️" }
        }]
      }
    ]
  }]
}
```

### Currency Update Response
```json
{
  "content": "💰 **Currency Updated!**\nYou found 50 coins in the chest!\n\nYour balance: 1,050 coins",
  "flags": 64
}
```

---

This documentation serves as the complete guide for implementing and extending CastBot's Safari system. Always refer to this document when working with Safari, Idol Hunt, Questions, or dynamic content features.