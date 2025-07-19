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

**💀 TERMINOLOGY NOTE:** Due to American English localization requirements, anywhere this documentation says "Shop" it should be read as "Store" for user-facing interfaces. Technical database keys remain as "shops" for compatibility.

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
├── pointsManager.js        # Points system (stamina, HP, etc.)
├── mapMovement.js          # Map exploration and movement
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

## Points System

The Safari Points System provides flexible resource management for pacing player activities and creating strategic gameplay decisions.

### Core Concepts
- **Resource Management**: Points (stamina, HP, mana) that limit player actions
- **Time-Based Regeneration**: Points recover automatically over time
- **Strategic Gameplay**: Forces meaningful choices about resource usage
- **Content Pacing**: Prevents players from rushing through content

### MVP Implementation: Movement Stamina
- **Purpose**: Limits map exploration to create meaningful exploration decisions
- **Cost**: 1 stamina point per map movement
- **Regeneration**: Full reset every 12 hours (configurable)
- **Integration**: Seamless with Safari button actions and conditions

### Technical Features
- **On-Demand Calculation**: No background processes needed
- **Timezone-Safe**: UTC-based timestamps for consistency
- **Entity-Agnostic**: Supports points for players, NPCs, items, locations
- **Configurable**: Server-specific point types and regeneration patterns

For detailed documentation, see [Safari Points System](SafariPoints.md) and [Map Movement System](SafariMapMovement.md).

## Data Structures

### safariContent.json
```json
{
  "guildId": {
    "pointsConfig": {
      "definitions": {
        "stamina": {
          "displayName": "Stamina",
          "emoji": "⚡",
          "defaultMax": 10,
          "defaultMin": 0,
          "regeneration": {
            "type": "full_reset",
            "interval": 43200000,
            "amount": "max"
          },
          "visibility": "hidden"
        }
      },
      "movementCost": {
        "stamina": 1
      }
    },
    "entityPoints": {
      "player_391415444084490240": {
        "stamina": {
          "current": 8,
          "max": 10,
          "lastRegeneration": 1703001234567,
          "lastUse": 1703001234567
        }
      }
    },
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
          "inventory": {},
          "mapState": {
            "currentCoordinate": "A1",
            "currentMapId": "map_5x5_1704236400000",
            "lastMovement": 1703001234567,
            "visitedCoordinates": ["A1", "B1", "B2"]
          }
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
- ✅ Safari submenu in Production Menu
- ✅ Create Custom Button interface
- ✅ Three action types:
  - `display_text`: Show formatted content
  - `update_currency`: Modify player currency
  - `follow_up_button`: Chain interactions
- ✅ Post button to channel
- ✅ Basic currency display

**Implementation:**
1. - ✅Create safariManager.js with core functions
2. - ✅Add Safari submenu to production menu
3. - ✅Implement button creation flow
4. - ✅Add button handler to app.js
5. - ✅Test with simple safari scenario

### MVP2 - Tycoons Challenge System ✅ COMPLETE (June 2025)

**Mission**: Complete functional store/inventory system for 24-hour dinosaur-themed Tycoons challenge with 13 players over 3 rounds.

#### **Sprint 1: Core Shop & Inventory System** ✅ COMPLETE
- ✅ Admin Set Balance: Create/update player currency balance
- ✅ Admin Create Item: Define items (name, emoji, description, price, category)
- ✅ Admin Create Store: Create shops (name, emoji, description, greeting)
- ✅ **Store Items**: Add/remove items from shops (PRIORITY 1)
- ✅ Player View Balance: Expose "My Status" to normal users
- ✅ **Store Display: Container with Section components for each item** ✨ COMPLETE
- ✅ **Resolve Purchase: Currency validation and inventory updates** ✨ COMPLETE
- ✅ Player View Items: Inventory display with quantities

#### **Sprint 2: Challenge Game Logic** ✅ COMPLETE
- ✅ Round Results: Calculate earnings/losses for all players
- ✅ Result Types: Define round outcomes (Clear Skies vs Meteor Strike)
- ✅ Item Yield Earnings: Item earning attributes for different conditions
- ✅ Item Attack/Defense Values: Combat calculations for rounds
- ✅ Consumable Items: Temporary items consumed during round results

#### **Sprint 3: Safari Attack System** ✅ COMPLETE
- ✅ **Attack Planning Interface**: Complete tactical attack system with user/quantity selection
- ✅ **Multi-Target Distribution**: Strategic attack splitting across multiple players
- ✅ **Attack Queue Management**: Round-based attack scheduling with persistent storage
- ✅ **Inventory Attack UI**: Section components with "⚔️ Attack Player" buttons
- ✅ **Real-Time Calculations**: Dynamic damage totals and planned attack displays
- ✅ **State Management**: Discord stateless interaction handling with embedded state

#### **Challenge Features Complete** ✅
- ✅ Custom Safari Labels: Guild-specific currency/item naming
- ✅ Item/Shop Editing: Update existing definitions
- ✅ Round Results Processing: Complete 3-round challenge game logic
- ✅ Attack System: Queued tactical combat for competitive gameplay

### MVP4 - Advanced Builder System (Post-Tycoons)

#### **Core Architectural Foundation**
Based on comprehensive analysis, MVP3 will implement the sophisticated builder system envisioned in mockups:

#### **1. Data Structure Redesign**
**Current**: Linear actions per button
**Target**: Conditional trigger components with success/failure action paths

```json
{
  "componentId": {
    "triggerType": "button", // future: "string_select", "modal", "role_select" 
    "triggerConfig": {...},
    "conditions": [
      {"id": "cond1", "type": "currency_gte", "value": 100, "operator": "AND"}
    ],
    "conditionLogic": "ALL", // or "ANY" for OR clauses
    "successActions": [...],
    "failureActions": [...]
  }
}
```

#### **2. Reusable Dynamic UI Framework**
Based on viral_menu pattern (app.js line 3309), create `DynamicComponentBuilder`:
- Condition Type Selection → Dynamic Condition Value Components
- Action Type Selection → Dynamic Action Configuration
- Trigger Type Selection → Dynamic Trigger Configuration

#### **3. Execution Engine Redesign**
```javascript
async function executeComponent(componentId, userId, interaction) {
  // 1. Evaluate all conditions with AND/OR logic
  // 2. Select success/failure action set
  // 3. Execute actions sequentially (separate messages)
}
```

#### **4. Extended Action Types**
**Current**: display_text, update_currency, follow_up_button
**Extended**: assign_role, remove_role, grant_channel_permission, revoke_channel_permission, assign_item, remove_item, send_dm, create_temporary_channel

#### **5. Advanced Condition Types**
**Current**: currency_gte/lte, has_item, not_has_item, button_used, cooldown_expired
**Extended**: has_role, in_channel, modal_text_matches, time_of_day, day_of_week

#### **6. Multiple Trigger Components**
**Current**: Buttons only
**Extended**: String selects, Role selects, Modal text inputs, Channel selects

#### **Features:**
- **Advanced Button Builder**: Sophisticated condition/action interface (see mockup)
- **Multiple Trigger Types**: String selects, modals, role/channel selects
- **Dynamic Condition Builder**: Viral_menu-style dynamic UI updates
- **Success/Failure Action Paths**: Conditional execution flows
- **Import/Export Templates**: Reusable safari configurations
- **Edit Existing Buttons**: Complete edit framework restoration

### MVP4 - Complex Logic & Multiple Safaris
**Features:**
- **Complex OR/AND Logic**: Mixed condition operators
- **Multiple Safaris per Guild**: Separate themed adventures
- **Advanced Condition Chaining**: Multi-level conditional trees
- **Visual Map Editor**: Image upload with auto-grid coordinate system

### MVP5 - Points System & Movement ✅ COMPLETE (January 2025)
**Features:**
- **Points Management System**: Flexible resource system for stamina, HP, mana, etc.
- **Map Movement System**: Grid-based exploration with stamina limitations
- **Discord Channel Integration**: Physical movement between map coordinate channels
- **On-Demand Regeneration**: Efficient, timezone-safe point recovery
- **Admin Controls**: Set player positions and points directly
- **Safari Action Integration**: New action types for points and movement

**Implementation:**
- ✅ `pointsManager.js`: Core points functionality with regeneration
- ✅ `mapMovement.js`: Movement logic and permission management
- ✅ Movement handlers in `app.js`: Player initialization and movement
- ✅ Safari action types: CHECK_POINTS, MODIFY_POINTS, MOVE_PLAYER
- ✅ Safari condition types: POINTS_GTE, POINTS_LTE, CAN_MOVE, AT_LOCATION

### MVP6 - Enterprise Features (Future: Month 1)
**Features:**
- **Multiple Safaris per Guild**: Separate themed adventures per server
- **Multiplayer Interactions**: Cross-player actions and trading
- **Leaderboards and Achievements**: Competitive progression systems
- **Scheduled Events**: Time-based automatic actions
- **Analytics Dashboard**: Usage statistics and player behavior

## UI/UX Design

### Production Menu Integration
```
📋 Production Menu
├── 🦁 Safari (MVP2 Enhanced)
│   ├── Row 1: Core Functions
│   │   ├── 📝 Create Custom Button
│   │   ├── 📤 Post Custom Button
│   │   ├── 📊 View All Buttons
│   │   └── 💎 My Status (NEW)
│   ├── Row 2: Admin & Management
│   │   ├── 💰 Manage Currency
│   │   ├── 🏪 Manage Shops (NEW)
│   │   └── 📦 Manage Items (NEW)
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

The Safari system supports multiple action types for interactive experiences. The core pipeline handles traditional actions, while specialized systems like the Attack System use dedicated workflows.

#### Core Action Execution
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
            case 'conditional':
                results.push(await executeConditional(action.config, userId, guildId, interaction));
                break;
            case 'random_outcome':
                results.push(await executeRandomOutcome(action.config, userId, guildId, interaction));
                break;
        }
    }
    
    // Combine results into single response
    return combineActionResults(results);
}
```

#### **🔥 SAFARI ATTACK SYSTEM (MVP3 Complete)**

**Overview:** Complete tactical attack system enabling players to strategically plan multi-target attacks using combat items with round-based queue scheduling.

##### **Attack System Architecture**

**Data Structure (playerData.json):**
```json
{
  "guildId": {
    "players": {
      "userId": {
        "safari": {
          "inventory": {
            "raider_499497": {
              "quantity": 15,           // Total items owned
              "numAttacksAvailable": 8  // Attacks not yet scheduled
            }
          }
        }
      }
    }
  }
}
```

**Queue Storage (safariContent.json):**
```json
{
  "guildId": {
    "attackQueue": {
      "round1": [
        {
          "attackingPlayer": "391415444084490240",
          "attackingPlayerName": "ReeceBot", 
          "defendingPlayer": "676262975132139522",
          "itemId": "raider_499497",
          "itemName": "Raider",
          "attacksPlanned": 3,
          "attackValue": 25,
          "totalDamage": 75,
          "timestamp": 1751174570983,
          "round": 1
        }
      ]
    }
  }
}
```

##### **Key System Behaviors**

**1. Attack Availability Tracking:**
- **Purchase**: `numAttacksAvailable` equals purchased quantity for attack items
- **Planning**: `numAttacksAvailable` reduced when attacks scheduled
- **Validation**: System prevents scheduling more attacks than available
- **Race Condition Protection**: Fresh data reload before modifications

**2. Multi-Target Distribution:**
- **Strategic Planning**: Single item type can attack multiple different players
- **Quantity Management**: Players choose how many attacks to use per target
- **Resource Optimization**: Split limited attack items across multiple enemies

**3. Round-Based Queuing:**
- **Current Round Tracking**: `safariConfig.currentRound` determines queue placement
- **Persistent Storage**: All attack records stored in `attackQueue.roundX` arrays
- **Complete Context**: Records include player names, item details, and damage calculations

**4. Real-Time UI System:**
- **Inventory Display**: Shows "⚔️ Attacks Available: X" and "🎯 Attacks Planned: Y"
- **Attack Planning**: User Select (target) → Quantity Select → Damage Calculation → Schedule
- **Enhanced Feedback**: Container components with attack details and damage totals

##### **Attack Planning Workflow**

**Step 1: Inventory Display**
```javascript
// Section components show attack items with blue buttons
{
  type: 9, // Section
  components: [
    {
      type: 10, // Text Display  
      content: `## 🦎 Raider\n⚔️ Attacks Available: 5\n🎯 Attacks Planned: 3`
    }
  ]
},
{
  type: 1, // Action Row
  components: [
    {
      type: 2, // Button
      custom_id: `safari_attack_plan_raider_499497`,
      label: "⚔️ Attack Player",
      style: 1 // Primary (blue)
    }
  ]
}
```

**Step 2: Target Selection**
```javascript
// Eligible target filtering: active players (currency ≥1 OR inventory items) excluding attacker
const eligibleTargets = await getEligibleAttackTargets(guildId, attackerId);
// User select menu with player options
```

**Step 3: Quantity Selection**  
```javascript
// String select with available attack quantities (1 to numAttacksAvailable)
// UI limit: Maximum 25 options (Discord string select limit)
```

**Step 4: Attack Scheduling**
```javascript
async function scheduleAttack(guildId, attackerId, itemId, targetId, quantity) {
    // 1. Validate attack availability
    // 2. Create attack record with damage calculation
    // 3. Add to current round queue
    // 4. Reduce numAttacksAvailable in inventory
    // 5. Return enhanced success message with Container
}
```

##### **Advanced Features**

**State Management:**
- **Stateless Discord Interactions**: Attack state embedded in custom_ids
- **Format**: `safari_schedule_attack_itemId_targetId_quantity`  
- **State Preservation**: Complete context maintained through interaction chain

**Damage Calculations:**
- **Attack Value**: Item `attackValue` property × quantity planned
- **Real-Time Display**: Total damage shown during planning and in confirmation
- **Record Storage**: Complete damage calculations stored in attack queue

**UI Components V2:**
- **Enhanced Messages**: Container components with red accent for attack themes
- **Button Styling**: Blue primary buttons for action emphasis
- **Non-Ephemeral**: Attack confirmations visible to all for transparency
- **Audit Trail**: Complete attack history maintained

##### **Integration with Round System**

**Current Implementation:**
- **Queue Population**: Attacks scheduled into `attackQueue.roundX` based on `currentRound`
- **Data Persistence**: Complete attack records with all necessary processing information
- **Player Identification**: Both user IDs and display names stored for flexibility

**Round Results Processing (Future Implementation):**
```javascript
// Planned round results integration
async function processAttackQueue(guildId, round) {
    const attacks = safariContent[guildId]?.attackQueue?.[`round${round}`] || [];
    
    for (const attack of attacks) {
        // 1. Apply damage to defending player
        // 2. Consume attack items if marked consumable
        // 3. Calculate defense reductions
        // 4. Generate attack results summary
        // 5. Update player inventories and currency
    }
    
    // Clear processed attack queue
    delete safariContent[guildId].attackQueue[`round${round}`];
}
```

**Defense Integration:**
- **Defense Values**: Items with `defenseValue` property reduce incoming damage
- **Damage Mitigation**: `totalDamage - defenseValue = actualDamage`
- **Strategic Gameplay**: Balance between attack and defense item purchases

##### **Error Handling & Validation**

**Race Condition Prevention:**
```javascript
// Fresh data reload before critical modifications
const freshPlayerData = await loadPlayerData();
const freshInventoryItem = freshPlayerData[guildId]?.players?.[attackerId]?.safari?.inventory?.[itemId];

// Validate with fresh data before proceeding
if (freshInventoryItem.numAttacksAvailable < quantity) {
    return errorResponse('Not enough attacks available');
}
```

**Input Validation:**
- **Target Eligibility**: Only active players (currency ≥1 OR inventory items)
- **Self-Attack Prevention**: Attackers cannot target themselves
- **Quantity Limits**: Cannot exceed `numAttacksAvailable`
- **Item Validation**: Attack items must have `attackValue` property

##### **Technical Implementation Details**

**Button Handler Pattern:**
```javascript
// Attack planning handler
safari_attack_plan_{itemId} → Show target selection

// Target selection handler  
safari_attack_target_{itemId}_{targetId} → Show quantity selection

// Schedule attack handler
safari_schedule_attack_{itemId}_{targetId}_{quantity} → Execute attack scheduling
```

**Database Operations:**
- **Atomic Updates**: Inventory and queue updates in single transaction
- **Data Validation**: Type checking and bounds validation
- **Backup Strategy**: Original data preserved before modifications

**Performance Considerations:**
- **Efficient Targeting**: Pre-filter eligible targets to reduce UI complexity
- **Batch Operations**: Multiple attack records can be processed simultaneously
- **Memory Management**: Attack queues cleared after round processing

##### **Future Enhancements**

**Round Results Integration:**
- **Damage Application**: Apply queued attacks to player inventories/currency
- **Defense Calculations**: Factor in defense values for damage mitigation  
- **Item Consumption**: Remove consumable attack items after use
- **Results Summary**: Generate comprehensive attack results report

**Advanced Attack Types:**
- **Live Attacks**: Immediate damage application (vs queued)
- **Instant Attacks**: Real-time combat outside round system
- **Special Abilities**: Items with unique attack mechanics
- **Combo Attacks**: Multi-item attack combinations

**Strategic Enhancements:**
- **Attack History**: Track player attack/defense patterns
- **Alliance System**: Team-based attack coordination
- **Revenge Tracking**: Monitor attack/counter-attack cycles
- **Battle Analytics**: Statistical analysis of combat effectiveness

The Safari Attack System represents a complete tactical combat framework built on CastBot's Safari foundation, providing competitive gameplay mechanics while maintaining scalability for advanced features.

---

## MVP3 Enhanced: Round Results V2 System (December 2025)

### **🎲 ROUND RESULTS PROCESSING ARCHITECTURE**

The Safari Round Results system has been completely redesigned to provide player-centric, ultra-compact results display that handles high-volume attack scenarios while staying within Discord's 4000 character limit.

#### **📊 Round Processing Pipeline**

**Phase 1: Income Resolution**
1. **Event Determination**: Random event selection based on configured probabilities
   - Round 1: 75% Clear Skies, 25% Asteroid Strike
   - Round 2: 50% Clear Skies, 50% Asteroid Strike  
   - Round 3: 25% Clear Skies, 75% Asteroid Strike
2. **Income Calculation**: Per-item earnings based on event outcome
   - Clear Skies: Uses `goodOutcomeValue` from item definitions
   - Asteroid Strike: Uses `badOutcomeValue` from item definitions
3. **Currency Updates**: Player balances increased by total income

**Phase 2: Combat Resolution**
1. **Attack Queue Processing**: All attacks for current round processed simultaneously
2. **Defense Calculation**: Total defense from inventory items with `defenseValue`
3. **Damage Application**: `Math.max(0, totalAttackDamage - totalDefense)` applied to currency
4. **Item Consumption**: Consumable attack items removed from attacker inventories
5. **Queue Cleanup**: Attack queue cleared after processing

**Phase 3: Results Display Generation**
1. **Player Cards**: Individual result cards for each eligible player
2. **Balance Tracking**: Before/after currency amounts with change calculations
3. **Attack Summaries**: Compact combat breakdowns with attacker/defender details
4. **Character Optimization**: Ultra-compact format to handle 10+ players under 4000 chars

#### **⚔️ ATTACK SYSTEM DETAILED DESIGN**

**Attack Queue Data Structure (safariContent.json):**
```json
{
  "guildId": {
    "attackQueue": {
      "round1": [
        {
          "attackingPlayer": "391415444084490240",
          "defendingPlayer": "676262975132139522",
          "itemId": "raider_499497",
          "attacksPlanned": 1,
          "totalDamage": 25,
          "timestamp": 1751174570983
        }
      ]
    }
  }
}
```

**Combat Resolution Algorithm:**
```javascript
async function processAttackQueue(guildId, currentRound, playerData, items, client) {
    const safariData = await loadSafariContent();
    const attackQueue = safariData[guildId]?.attackQueue?.[`round${currentRound}`] || [];
    
    // Group attacks by defender for efficient processing
    const attacksByDefender = {};
    for (const attack of attackQueue) {
        if (!attacksByDefender[attack.defendingPlayer]) {
            attacksByDefender[attack.defendingPlayer] = [];
        }
        attacksByDefender[attack.defendingPlayer].push(attack);
    }
    
    // Process each defended player
    const attackResults = [];
    for (const [defenderId, attacks] of Object.entries(attacksByDefender)) {
        const defender = playerData[guildId]?.players?.[defenderId];
        
        // Calculate total attack damage
        const totalAttackDamage = attacks.reduce((sum, attack) => sum + attack.totalDamage, 0);
        
        // Calculate defender's total defense
        const totalDefense = calculatePlayerDefense(defender.safari.inventory || {}, items);
        
        // Apply damage (minimum 0)
        const netDamage = Math.max(0, totalAttackDamage - totalDefense);
        const originalCurrency = defender.safari.currency || 0;
        defender.safari.currency = Math.max(0, originalCurrency - netDamage);
        
        attackResults.push({
            defenderId,
            defenderName: await getPlayerDisplayName(defenderId, guildId, client),
            totalAttackDamage,
            totalDefense,
            damageDealt: netDamage,
            originalCurrency,
            newCurrency: defender.safari.currency,
            attackCount: attacks.length,
            attackers: attacks.map(a => ({ 
                name: a.attackingPlayerName, 
                damage: a.totalDamage,
                itemName: a.itemName,
                quantity: a.attacksPlanned
            }))
        });
    }
    
    // Consume attack items
    await consumeAttackItems(attackQueue, playerData, guildId, items);
    
    return { attackResults, attackQueue, attacksByDefender };
}
```

**Defense Calculation System:**
```javascript
function calculatePlayerDefense(playerInventory, items) {
    let totalDefense = 0;
    
    for (const [itemId, itemData] of Object.entries(playerInventory)) {
        const item = items[itemId];
        if (!item?.defenseValue) continue;
        
        const quantity = typeof itemData === 'object' ? itemData.quantity : itemData;
        totalDefense += (item.defenseValue * quantity);
    }
    
    return totalDefense;
}
```

#### **🎨 ROUND RESULTS V2 DISPLAY SYSTEM**

**Ultra-Compact Player Card Format:**
```
🎯 Mike
Start: 620🥚

📈 INCOME
☄️ Asteroid Strike

🐣 8x35: 280🥚 
🦖 8x0: 0🥚

Total: 280🥚

⚔️ COMBAT
🦎🗡️ 3x25 (75) - 🦕🛡️ 3x50 (150)
Combat Damage: 0🥚

Final: 900🥚
```

**Character Budget Management:**
- **Target**: ~300-400 characters per player card
- **For 10 players**: ~3000-4000 characters total (within Discord limit)
- **Compression Strategy**: 
  - Remove verbose text ("Starting Balance" → "Start")
  - Eliminate spaces before emoji
  - Compact calculations (show formula results only)
  - Ultra-compact combat format for high attack volumes

**Combat Display Compression Levels:**

1. **Standard Format** (≤5 attacks on player):
   ```
   ⚔️ COMBAT
   🦎🗡️ 3x25 (75) - 🦕🛡️ 2x50 (100)
   Combat Damage: 0🥚
   ```

2. **Compact Format** (5-10 attacks on player):
   ```
   ⚔️ COMBAT
   🦎🗡️ 8x25 (200) - 🦕🛡️ 4x50 (200)
   Combat Damage: 0🥚
   ```

3. **Ultra-Compact Format** (>10 attacks on player):
   ```
   ⚔️ COMBAT
   5 attackers, 15 attacks
   Combat Damage: 25🥚
   ```

#### **🔄 ROUND LIFECYCLE MANAGEMENT**

**Round Initialization:**
```javascript
async function startNewRound(guildId) {
    const safariData = await loadSafariContent();
    if (!safariData[guildId]?.safariConfig) {
        throw new Error('Safari not configured for this guild');
    }
    
    // Increment round counter
    safariData[guildId].safariConfig.currentRound = 
        (safariData[guildId].safariConfig.currentRound || 0) + 1;
    
    // Clear previous round's attack queue
    const currentRound = safariData[guildId].safariConfig.currentRound;
    if (safariData[guildId].attackQueue?.[`round${currentRound}`]) {
        delete safariData[guildId].attackQueue[`round${currentRound}`];
    }
    
    await saveSafariContent(safariData);
}
```

**Round Results Execution:**
```javascript
async function processRoundResults(guildId, client) {
    const playerData = await loadPlayerData();
    const safariData = await loadSafariContent();
    const items = safariData[guildId]?.items || {};
    const config = safariData[guildId]?.safariConfig || {};
    
    // Determine round event
    const currentRound = config.currentRound || 1;
    const goodProbability = config[`round${currentRound}GoodProbability`] || 50;
    const isGoodEvent = Math.random() * 100 < goodProbability;
    
    // Process income for all eligible players
    const eligiblePlayers = await getEligibleSafariPlayers(guildId, playerData);
    const playerBalanceChanges = {};
    
    for (const player of eligiblePlayers) {
        const originalBalance = player.currency || 0;
        const income = calculatePlayerIncome(player.inventory, items, isGoodEvent);
        player.currency = originalBalance + income;
        
        playerBalanceChanges[player.userId] = {
            starting: originalBalance,
            ending: player.currency,
            change: income
        };
    }
    
    // Process attack queue
    const { attackResults, attacksByDefender } = await processAttackQueue(
        guildId, currentRound, playerData, items, client
    );
    
    // Update balance changes with attack damage
    for (const result of attackResults) {
        if (playerBalanceChanges[result.defenderId]) {
            playerBalanceChanges[result.defenderId].ending = result.newCurrency;
            playerBalanceChanges[result.defenderId].change = 
                result.newCurrency - playerBalanceChanges[result.defenderId].starting;
        }
    }
    
    // Save updated player data
    await savePlayerData(playerData);
    
    // Generate V2 results display
    return createRoundResultsV2(guildId, {
        currentRound,
        isGoodEvent,
        eventName: isGoodEvent ? config.goodEventName : config.badEventName,
        eventEmoji: isGoodEvent ? config.goodEventEmoji : config.badEventEmoji,
        eligiblePlayers,
        attacksByDefender,
        playerBalanceChanges
    }, config);
}
```

#### **📱 DISCORD COMPONENTS V2 IMPLEMENTATION**

**Header Container:**
```javascript
const headerContainer = {
    type: 17, // Container
    accent_color: isGoodEvent ? 0x27ae60 : 0xe74c3c, // Green/Red
    components: [
        {
            type: 10, // Text Display
            content: `# 🎲 Round ${currentRound} Results\n\n## ${eventEmoji} ${eventName}\n\n**${eligiblePlayers.length} players participated**`
        }
    ]
};
```

**Player Result Cards:**
```javascript
// Each player gets individual container with accent color based on balance change
const playerCard = {
    type: 17, // Container
    accent_color: change > 0 ? 0x27ae60 : change < 0 ? 0xe74c3c : 0x95a5a6,
    components: [
        {
            type: 10, // Text Display
            content: ultraCompactPlayerContent // Generated from income + combat + final balance
        }
    ]
};
```

**Navigation Components:**
```javascript
// Optional inventory button if component count allows
if (componentCount < 39) {
    const buttonContainer = {
        type: 17, // Container
        accent_color: 0x3498db, // Blue
        components: [
            {
                type: 1, // Action Row
                components: [
                    {
                        type: 2, // Button
                        custom_id: 'safari_player_inventory',
                        label: 'View My Inventory',
                        style: 2, // Secondary
                        emoji: { name: '🎒' }
                    }
                ]
            }
        ]
    };
}
```

#### **⚡ PERFORMANCE OPTIMIZATIONS**

**Component Limit Management:**
- **Discord Limit**: 40 components maximum per message
- **Strategy**: 1 header + N player cards + optional buttons
- **Safeguard**: Skip buttons if player count > 38

**Character Limit Management:**
- **Discord Limit**: 4000 characters across ALL components
- **Strategy**: Ultra-compact format with progressive compression
- **Dynamic Sizing**: Character budget calculated per player count

**Memory Efficiency:**
- **Attack Queue**: Cleared immediately after processing
- **Player Name Caching**: Reduces Discord API calls during result generation
- **Batch Operations**: All currency updates applied in single save operation

#### **🛡️ ERROR HANDLING & EDGE CASES**

**Attack Validation:**
```javascript
// Skip corrupted attack records
if (!attack.defendingPlayer || !attack.attackingPlayer || !attack.itemId ||
    !attack.attacksPlanned || attack.attacksPlanned > 1000 || attack.attacksPlanned < 0 ||
    isNaN(attack.totalDamage)) {
    console.log(`⚠️ DEBUG: Skipping invalid attack:`, attack);
    continue;
}
```

**Defense Calculation Protection:**
```javascript
// Handle missing or invalid defense values
const defenseValue = item?.defenseValue;
if (defenseValue && !isNaN(defenseValue) && defenseValue > 0) {
    totalDefense += (defenseValue * quantity);
}
```

**Currency Floor Protection:**
```javascript
// Never allow negative currency
defender.safari.currency = Math.max(0, originalCurrency - netDamage);
```

#### **🔮 FUTURE ENHANCEMENTS**

**Advanced Combat Mechanics:**
- **Weapon Durability**: Items degrade with use
- **Critical Hits**: Random damage multipliers
- **Battle Formations**: Strategic positioning bonuses
- **Alliance Combat**: Team-based attack coordination

**Enhanced Results Display:**
- **Interactive Results**: Clickable player cards for detailed breakdown
- **Animation Effects**: Progressive reveal of results
- **Historical Comparison**: Compare with previous rounds
- **Export Functionality**: Save results as images or documents

**Strategic Depth:**
- **Terrain Effects**: Map-based combat modifiers
- **Weather Systems**: Dynamic event probability changes
- **Resource Scarcity**: Limited item availability per round
- **Economic Warfare**: Market manipulation through supply/demand

The Round Results V2 System provides a complete, scalable foundation for complex competitive gameplay while maintaining Discord platform constraints and user experience excellence.

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
   ./scripts/dev/dev-restart.sh "Add Safari dynamic content system MVP1"
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

## MVP2 Implementation Summary (June 2025)

### 🏪 Enhanced Shop System
**Architecture:**
- **Multi-Shop Support**: Multiple stores per server with unique configurations
- **Reusable Items**: Items defined once, used across multiple shops with shop-specific pricing
- **Smart Component Handling**: Automatic 40-component limit management with item truncation warnings
- **Role-Based Access**: Shop access can be restricted by Discord roles
- **Purchase Workflow**: Complete buy/sell system with currency deduction and inventory management

**Technical Implementation:**
```javascript
// Enhanced safariContent.json structure
{
  "guildId": {
    "shops": {
      "adventure_shop": {
        "name": "Adventure Supplies",
        "emoji": "🏪",
        "items": [{"itemId": "magic_sword", "price": 200}],
        "settings": {
          "storeownerText": "Welcome traveler!",
          "accentColor": 2874814,
          "requiresRole": null
        }
      }
    },
    "items": {
      "magic_sword": {
        "name": "Magic Sword",
        "emoji": "⚔️",
        "basePrice": 250,
        "maxQuantity": 1
      }
    }
  }
}
```

### 💰 Enhanced Currency & Inventory System
**Features:**
- **Player Status Display**: "My Status" button shows currency and inventory
- **Inventory Management**: Track item quantities with purchase history
- **Transaction Logging**: Complete audit trail of all purchases
- **Currency Display**: Real-time balance updates in shop interfaces

**Player Data Enhancement:**
```javascript
// Enhanced playerData.json structure
{
  "safari": {
    "currency": 1000,
    "inventory": {"magic_sword": 1, "health_potion": 3},
    "cooldowns": {"daily_quest_button": 1703087234567},
    "buttonUses": {"adventure_start": 5},
    "shopHistory": [{"itemId": "magic_sword", "price": 200, "timestamp": 1703001234567}]
  }
}
```

### 🔀 Conditional Actions System
**Condition Types:**
- `currency_gte`: Currency >= value
- `currency_lte`: Currency <= value  
- `has_item`: Player has item (with quantity check)
- `not_has_item`: Player doesn't have item
- `button_used`: Button used N times
- `cooldown_expired`: Cooldown expired

**Usage Example:**
```javascript
{
  "type": "conditional",
  "config": {
    "condition": {"type": "currency_gte", "value": 50},
    "successActions": [{"type": "display_text", "config": {...}}],
    "failureMessage": "You need 50 coins to continue!"
  }
}
```

### 🎲 Random Outcomes System
**Features:**
- **Weighted Probabilities**: Define outcomes with custom weights
- **Action Chaining**: Each outcome can trigger its own actions
- **Fallback System**: Guaranteed outcome selection with safety mechanisms

**Implementation:**
```javascript
{
  "type": "random_outcome",
  "config": {
    "outcomes": [
      {
        "name": "Lucky Find",
        "weight": 30,
        "actions": [{"type": "update_currency", "config": {"amount": 100}}]
      },
      {
        "name": "Nothing Here",
        "weight": 70,
        "description": "You search but find nothing."
      }
    ]
  }
}
```

### 🔧 Technical Achievements
- **40-Component Limit**: Smart handling prevents Discord errors
- **Emoji Support**: Full Discord emoji support in items and shops
- **Error Handling**: Comprehensive error recovery and user feedback
- **Performance**: Optimized shop display generation
- **Scalability**: Foundation ready for thousands of items and shops

### 🚀 Safari MVP2 Status: PRODUCTION READY
- All MVP2 features implemented and tested
- Enhanced Safari menu with organized button layout
- Complete shop and item management system operational
- Conditional actions and random outcomes functional
- Player inventory and status display working
- Ready for advanced Safari content creation

---

## MVP2 Sprint 3 - Entity Management Framework (July 2025)

### **Overview**
Sprint 3 introduces a unified entity management framework for Safari items, stores, and buttons. This replaces the previous placeholder "Coming Soon" functionality with a comprehensive CRUD interface following established CastBot UI patterns.

### **Core Architecture**

#### **1. Entity Management UI (`entityManagementUI.js`)**
- **Purpose**: Provides consistent interface for managing all Safari entities
- **Key Features**:
  - Searchable entity selector with "Add new" option
  - Dynamic field grouping for better UX
  - View/Edit/Delete modes
  - Real-time validation and updates
  - Components V2 with container layout

#### **2. Entity Manager (`entityManager.js`)**
- **Purpose**: Handles all CRUD operations while maintaining safariContent.json compatibility
- **Functions**:
  - `loadEntities()` - Load entities by type
  - `createEntity()` - Create with auto-generated IDs
  - `updateEntityFields()` - Field-level updates with nested support
  - `deleteEntity()` - Safe deletion with reference cleanup
  - `searchEntities()` - Filter by name, description, or tags

#### **3. Field Editors (`fieldEditors.js`)**
- **Purpose**: Type-specific field editing with validation
- **Grouped Modals**:
  - **Item Info**: Name & Description
  - **Financials**: Base Price, Good/Bad Outcome Values
  - **Battle**: Attack & Defense Values
  - **Properties**: Consumable status (via select menu)
- **Validation**: Type checking, range limits, required fields

#### **4. UX Design Principles**
- **Direct Editing**: No separate "view mode" - selecting an entity goes straight to edit interface
- **Immediate Actions**: Field group buttons execute actions directly (open modals/show components)
- **No Redundant Steps**: Eliminate intermediate "Edit X" buttons that add unnecessary clicks
- **Contextual Display**: Entity details remain visible while editing
- **Intuitive Flow**: Reduce cognitive load by removing mode switching
- **Consistent Behavior**: Apply same principles to stores and buttons

### **Implementation Details**

#### **Entry Points**
- `safari_item_manage_existing` → Opens entity management UI
- `safari_manage_items` → Main item management menu (unchanged)
- Future: `safari_manage_stores`, `safari_manage_safari_buttons`

#### **Button Handler Pattern**
```javascript
// Entity selection
entity_select_item → Handle dropdown selection
entity_select_item → search_entities → Show search modal
entity_select_item → create_new → Show creation modal

// Mode switching
entity_edit_mode_item_[id] → Switch to edit mode
entity_view_mode_item_[id] → Return to view mode
entity_delete_mode_item_[id] → Show delete confirmation

// Field editing
entity_field_group_item_[id]_info → Activate field group
entity_edit_modal_item_[id]_info → Show modal
entity_modal_submit_item_[id]_info → Process submission

// Special handlers
entity_consumable_select_item_[id] → Update consumable
entity_confirm_delete_item_[id] → Execute deletion
```

#### **Data Structure Compatibility**
- Maintains existing safariContent.json format
- No breaking changes to existing data
- Automatic reference cleanup on deletion
- Preserves metadata (createdAt, totalSold, etc.)

### **User Experience Flow**

1. **Initial Load**: Shows entity list with search option (10+ items)
2. **Selection**: Choose entity or "Add new" from dropdown
3. **Direct Edit Mode**: Skip view mode - go directly to edit interface showing:
   - Entity details at top
   - Field group buttons for immediate editing
   - Delete and Back options
4. **Immediate Action**: Clicking field group buttons directly opens modals/components:
   - **Text/Number Fields**: Opens modal immediately
   - **Properties**: Shows select menu component directly
   - No intermediate "Edit X" buttons
5. **Validation**: Real-time feedback on invalid inputs
6. **Auto-save**: Changes persist immediately

### **Technical Achievements**

- **Modular Design**: Reusable for stores and buttons
- **Smart Search**: Searches name, description, and tags
- **Grouped Fields**: Reduces cognitive load with logical grouping
- **Reference Integrity**: Removes deleted items from stores
- **Backward Compatible**: Works with existing Safari data

### **Testing Considerations**

1. **Critical Path**: Ensure `safari_store_browse_*` continues working
2. **Data Integrity**: Verify safariContent.json updates correctly
3. **Validation**: Test field limits and required fields
4. **Search**: Verify filtering works with special characters
5. **Deletion**: Confirm store references are cleaned up

### **Next Steps**

1. **Store Management**: Apply same framework to stores
2. **Button Management**: Extend to Safari buttons (excluding action editing)
3. **Bulk Operations**: Import/export functionality
4. **Advanced Search**: Multi-field search with filters
5. **Cross-entity Relations**: Visual relationship mapping

### **Entity Creation Flow Implementation**

#### **Create New Entity Workflow**
1. **Dropdown Positioning**: "➕ Create New" appears as the first option in entity selector
2. **Modal Selection**: Uses appropriate Info modal based on entity type:
   - **Items**: Name, Emoji, Description (3 fields)
   - **Stores**: Name, Emoji, Description (3 fields)  
   - **Buttons**: Label, Emoji (Button Info modal)
3. **Creation Process**: 
   - Modal submission parsed via `parseModalSubmission()` from fieldEditors.js
   - Validation performed via `validateFields()`
   - Entity created via `createEntity()` from entityManager.js
   - Automatic ID generation and metadata assignment
4. **Post-Creation UX**: User immediately redirected to edit interface for newly created entity
5. **Error Handling**: Comprehensive validation with user-friendly error messages

#### **Technical Implementation**
- **Handler Pattern**: `entity_create_modal_{entityType}_info`
- **Modal Generation**: Reuses existing field group modals from fieldEditors.js
- **Data Flow**: Modal → Field Parsing → Validation → Entity Creation → Edit Interface
- **ID Generation**: Uses `generateEntityId()` for consistent naming patterns
- **Permissions**: Requires ManageRoles permission for all creation operations

#### **Code Integration Points**
```javascript
// 1. Entity Selector (entityManagementUI.js)
// - "Create New" moved to first position
// - Consistent across all entity types

// 2. Selection Handler (app.js)
// - entity_select_item → create_new value
// - Dynamic modal generation via createFieldGroupModal()

// 3. Creation Handler (app.js) 
// - entity_create_modal_{entityType}_info
// - Full creation flow with validation and redirect

// 4. Entity Manager Integration
// - createEntity() handles all data persistence
// - Automatic metadata and defaults application
```

### **Known Limitations**

- Safari button actions require specialized UI (not included)
- Store item management uses existing specialized interface
- Search limited to single term (no advanced operators)
- No undo functionality for deletions
- Entity creation limited to Info fields (basic properties only)

---

## MVP2 Sprint 4 - Attack/Defense Resolution System Implementation (January 2025)

### **🎯 CRITICAL IMPLEMENTATION DEADLINE: 15 HOURS (Including Sleep)**

**Context:** Completing attack/defense system for Tycoons game deployment in 14 hours with 12 players. No production users at risk - single test server (1331657596087566398) with planned export to production server (1365751181292474571).

### **📋 Implementation Requirements Summary**

Based on user feedback and system analysis:

#### **1. Attack Resolution Logic**
**When round results process:**
1. **Yield Resolution First**: Player currency updated with item earnings
2. **Attack Calculation**: `attackedPlayer new Balance = Existing Balance - ((Total Defense) - (Total Attacks))`
3. **Damage Application**: Currency reduced by net damage (minimum 0)
4. **Item Consumption**: Remove consumable attack items from attacker inventories

#### **2. Attack History Decision: SKIP FOR NOW**
- **Rationale**: Time constraint priority - attack history not critical for gameplay
- **Future Enhancement**: Can be added post-deployment for analytics

#### **3. Round Queue Processing: ALL ATTACKS CURRENT ROUND**
- Process all attacks for current round simultaneously
- No leftover attacks between rounds
- Clear attack queue after processing

#### **4. Edge Case Handling**
- **Insufficient Items**: Log detailed error in round results, continue processing
- **Negative Currency**: Always floor at 0, never allow negative
- **Defense Items**: Permanent protection (not consumable)

#### **5. Object Format Migration: MANDATORY**
- Convert all inventory items from legacy number format to object format
- Enables consistent attack availability tracking
- Foundation for future item properties

#### **6. Round Results Display Enhancement**
- Show individual attack damage per attacker
- Display total defense calculation breakdown  
- Show before/after currency amounts
- Handle 12-player scaling within 4000 character limit

### **⚡ 3-Step Implementation Strategy**

#### **Step 1: Object Format Migration (20 minutes)**
**Risk Level:** 🟡 Low-Medium  
**Dependencies:** None  
**Rollback:** Full playerData.json backup

**Tasks:**
- Create universal inventory accessor functions
- Update all code to handle object format consistently  
- Create and run data migration script
- Test inventory display and purchasing

**Test Criteria:**
- ✅ Inventory displays correctly with object format
- ✅ Store purchases work without errors
- ✅ Attack items maintain availability counters
- ✅ Legacy players successfully migrated

#### **Step 2: Attack Resolution Core (30 minutes)**
**Risk Level:** 🟠 Medium  
**Dependencies:** Step 1 complete  
**Rollback:** Code rollback, data already migrated

**Tasks:**
- Implement defense calculation system
- Create attack queue processing logic
- Add attack item consumption for consumables
- Integrate with existing `processRoundResults()`

**Test Criteria:**
- ✅ Defense properly calculated from inventory
- ✅ Attack damage correctly applied to currency
- ✅ Consumable items removed after attacks
- ✅ Attack queue cleared after processing

#### **Step 3: Enhanced Results Display (15 minutes)**
**Risk Level:** 🟢 Low  
**Dependencies:** Step 2 complete  
**Rollback:** Simple text fallback

**Tasks:**
- Add attack breakdown to round results
- Implement compact 12-player display format
- Include before/after currency summary
- Character limit optimization

**Test Criteria:**
- ✅ Attack results clearly displayed
- ✅ 12-player scenario under 4000 characters
- ✅ Individual attacker damage shown
- ✅ Defense breakdown visible

### **🏗️ Technical Implementation Details**

#### **Object Format Data Structure**
```json
// Target format for ALL inventory items
"inventory": {
  "raider_499497": {
    "quantity": 5,
    "numAttacksAvailable": 2
  },
  "nurturer_361363": {
    "quantity": 3, 
    "numAttacksAvailable": 0  // Non-attack items
  },
  "nest_guardian_461600": {
    "quantity": 2,
    "numAttacksAvailable": 0  // Defense items
  }
}
```

#### **Attack Resolution Algorithm**
```javascript
// Phase 1: Calculate total defense
function calculatePlayerDefense(playerInventory, items) {
  let totalDefense = 0;
  for (const [itemId, itemData] of Object.entries(playerInventory)) {
    const item = items[itemId];
    if (item?.defenseValue) {
      totalDefense += (item.defenseValue * itemData.quantity);
    }
  }
  return totalDefense;
}

// Phase 2: Process attack queue
async function processAttackQueue(guildId, currentRound, playerData, items) {
  const attackQueue = safariData[guildId]?.attackQueue?.[`round${currentRound}`] || [];
  
  // Group attacks by defender
  const attacksByDefender = {};
  for (const attack of attackQueue) {
    if (!attacksByDefender[attack.defendingPlayer]) {
      attacksByDefender[attack.defendingPlayer] = [];
    }
    attacksByDefender[attack.defendingPlayer].push(attack);
  }
  
  // Process each defender
  for (const [defenderId, attacks] of Object.entries(attacksByDefender)) {
    const defender = playerData[guildId]?.players?.[defenderId];
    const totalAttackDamage = attacks.reduce((sum, attack) => sum + attack.totalDamage, 0);
    const totalDefense = calculatePlayerDefense(defender.safari.inventory || {}, items);
    const netDamage = Math.max(0, totalAttackDamage - totalDefense);
    
    defender.safari.currency = Math.max(0, (defender.safari.currency || 0) - netDamage);
  }
  
  return { attackResults, attackQueue };
}

// Phase 3: Consume attack items
async function consumeAttackItems(attackQueue, playerData, guildId, items) {
  for (const attack of attackQueue) {
    const attacker = playerData[guildId]?.players?.[attack.attackingPlayer];
    const item = items[attack.itemId];
    
    if (item?.consumable === "Yes") {
      const inventoryItem = attacker.safari.inventory[attack.itemId];
      inventoryItem.quantity = Math.max(0, inventoryItem.quantity - attack.attacksPlanned);
    }
  }
}
```

#### **Round Results Display Format**
```javascript
// Compact format for 12 players
if (attackResults.length > 0) {
  content += '\n\n## ⚔️ Battle Results\n';
  
  for (const result of attackResults) {
    content += `**${result.defenderName}:** `;
    content += `${result.totalAttackDamage} dmg - ${result.totalDefense} def = ${result.netDamage} net | `;
    content += `${result.originalCurrency} → ${result.newCurrency} ${customTerms.currencyName}\n`;
  }
}
```

### **🧪 Test Scenarios by Step**

#### **Step 1 Testing: Object Format Migration**
```bash
# Test Case 1: Existing legacy inventory
# Before: "nurturer_361363": 3
# After: "nurturer_361363": {"quantity": 3, "numAttacksAvailable": 0}

# Test Case 2: Mixed format inventory  
# Should handle existing object + legacy items

# Test Case 3: Store purchase
# Should create proper object format for new items

# Test Case 4: Inventory display
# Should show quantities correctly
```

#### **Step 2 Testing: Attack Resolution**
```bash
# Test Case 1: Basic attack scenario
# Belle: 4x Raider (100 dmg) vs Reece: 2x Nest Guardian (100 def)
# Expected: 0 net damage, no currency loss

# Test Case 2: Penetrating attack
# Belle: 6x Raider (150 dmg) vs Reece: 2x Nest Guardian (100 def)  
# Expected: 50 net damage, currency reduced by 50

# Test Case 3: Item consumption
# Raiders should be consumed after attacks
# Non-consumable items should remain
```

#### **Step 3 Testing: Results Display**
```bash
# Test Case 1: Single attack
# Should show attacker, damage, defense breakdown

# Test Case 2: Multiple attackers on one defender
# Should aggregate damage correctly

# Test Case 3: 12-player scenario
# Should stay under 4000 character limit
```

### **🚨 Critical Rollback Procedures**

#### **If Step 1 Fails (Object Migration)**
```bash
# 1. Restore playerData.json from backup
cp playerData.backup.TIMESTAMP.json playerData.json

# 2. Rollback code changes
git checkout HEAD~1 safariManager.js

# 3. Restart service
./scripts/dev/dev-restart.sh "Rollback object format migration"
```

#### **If Step 2 Fails (Attack Resolution)**
```bash
# 1. Code rollback only (data migration preserved)
git checkout HEAD~1 safariManager.js

# 2. Restart service  
./scripts/dev/dev-restart.sh "Rollback attack resolution, keep object format"
```

#### **If Step 3 Fails (Display Enhancement)**
```bash
# 1. Revert to basic text display
# 2. Attack system remains functional
# 3. Polish display post-deployment
```

### **⏰ Implementation Timeline**

**Total Estimated Time: 65 minutes**
- Step 1: 20 minutes implementation + 5 minutes testing
- Step 2: 30 minutes implementation + 10 minutes testing  
- Step 3: 15 minutes implementation + 5 minutes testing

**Buffer Time: 25 minutes for debugging and refinement**

### **🎯 Success Criteria**

**Minimum Viable Product (Must Have):**
- ✅ All inventory items use object format
- ✅ Attack queue processes correctly
- ✅ Defense calculations work properly
- ✅ Consumable items consumed after attacks
- ✅ Currency properly updated (never negative)
- ✅ Round results include attack breakdown

**Nice to Have (If Time Permits):**
- Enhanced visual formatting for results
- Detailed attack breakdown per player
- Performance optimizations

### **📝 Context Preservation Note**

**🔍 IMPORTANT FOR FUTURE CLAUDE INSTANCES:**

If this conversation gets compacted and you're picking up implementation:

1. **Read this entire MVP2 Sprint 4 section** for complete context
2. **Current Status**: Check which steps are complete by testing the system
3. **Test Server**: 1331657596087566398 (live data, no production users)
4. **Export Destination**: Server 1365751181292474571 for production
5. **Timeline**: CRITICAL - Tycoons game in ~14 hours with 12 players
6. **Risk Tolerance**: Medium (no production users, but time-critical deployment)

**Key Files to Review:**
- `safariManager.js` - Core Safari functionality and attack system
- `playerData.json` - Player inventory data structure  
- `safariContent.json` - Attack queue and item definitions
- `Safari.md` - This documentation (you're reading it now!)

**Testing Protocol:** Follow the 3-step implementation with rollback procedures if any step fails.

---

This documentation serves as the complete guide for implementing and extending CastBot's Safari system. Always refer to this document when working with Safari, Idol Hunt, Questions, or dynamic content features.

## Safari Custom Actions System (Location Actions) - CRITICAL CONTEXT

### 🚨 COMPACTION PRESERVATION - CUSTOM ACTIONS FEATURE

**Feature Name**: Safari Custom Actions (formerly "Safari Buttons" in UI, now "Location Actions")

**Core Concept**: A many-to-many relationship system where Custom Actions can be assigned to zero or many map coordinates, and coordinates can have multiple actions assigned.

#### Critical Design Decisions (MUST PRESERVE):

1. **Data Model**: BIDIRECTIONAL many-to-many relationship
   - Actions store which coordinates they're assigned to (optional)
   - Coordinates store which actions are assigned to them (required)
   - Stored in `coordinates[coord].buttons = [actionIds]` in safariContent.json

2. **Trigger Types** (Beyond Buttons):
   - **Button Click**: Traditional button interaction
   - **String Select**: Components V2 select menu
   - **Modal Input**: Text input with keyword matching
   - **Role Select**: User/role selection
   - **Channel Select**: Channel selection
   - Future: Time-based, location-based, item-based triggers

3. **UI Pattern**: Entity Framework with custom field handling
   - Uses standard entity management pattern
   - "interaction" field group shows action selection
   - String select lists all available actions
   - Selecting action allows editing that applies globally

4. **Auto-Assignment**: When creating new action from location
   - Coordinate is automatically assigned based on channel context
   - Actions remain reusable across multiple coordinates
   - Pre-population happens in action editor

5. **Naming**: "Custom Actions" in UI (not buttons)
   - Backend still uses "buttons" for compatibility
   - UI terminology updated for clarity

6. **Integration Flow**:
   - Click "Location Actions" on map coordinate
   - See dropdown of existing actions + "Create New"
   - Select action to edit/assign
   - Changes apply across all assigned coordinates

#### Data Structure:
```json
{
  "buttons": {
    "action_id": {
      "label": "Enter Cave",
      "trigger": {
        "type": "button|modal|select",
        "config": {...}
      },
      "conditions": {...},
      "actions": [...],
      "coordinates": ["A1", "B2"] // Optional tracking
    }
  },
  "maps": {
    "map_id": {
      "coordinates": {
        "A1": {
          "buttons": ["action_id_1", "action_id_2"], // Required
          "channelId": "...",
          "baseContent": {...}
        }
      }
    }
  }
}
```

#### Implementation Status:
- ✅ UI framework created (customActionUI.js)
- ✅ Button registry updated
- ✅ Handler infrastructure in place
- ❌ Bidirectional data sync not working
- ❌ Auto-assignment from channel context missing
- ❌ Entity Framework integration incomplete
- ❌ Modal trigger type (text commands) not fully implemented

## Implementation History

### SAFARI ATTACK SYSTEM ✅ MVP3 COMPLETE

**Major Feature Addition: Safari Queued Attack System MVP3**
- **⚔️ Attack Planning Interface**: Complete tactical attack system with target selection and quantity management
- **🎯 Multi-Target Distribution**: Players can split attacks from single item across multiple targets for strategic gameplay
- **📊 Attack Availability Tracking**: Persistent `numAttacksAvailable` storage with real-time inventory updates
- **🗂️ Attack Queue Management**: Round-based attack scheduling stored in `safariContent.json` with full state persistence
- **🔄 Dynamic UI Updates**: Real-time attack calculations, damage totals, and planned attack displays
- **🛡️ Eligible Target Filtering**: Only shows active players (currency ≥1 OR inventory items) excluding attacker
- **📈 Scalable Architecture**: Built for future attack types (live, instant) while hard-coding current queued approach

**Technical Implementation:**
- **Attack Data Structure**: Enhanced inventory format with `quantity` and `numAttacksAvailable` properties in `playerData.json`
- **Queue Storage**: `safariContent.json` → `attackQueue.round{X}` with structured attack records including damage calculations
- **State Management**: Discord interaction state embedded in custom_ids to handle stateless UI updates
- **UI Components**: Section components with blue "⚔️ Attack Player" buttons for attack items in inventory display
- **Handler Integration**: Complete button handler system with proper dynamic handler exclusions

**MVP3 Status:** ✅ PRODUCTION READY
- Complete attack planning and scheduling system operational
- Multi-target attack distribution fully functional
- Real-time UI updates and state management working
- Attack queue persistence and round integration ready
- Ready for Tycoons game deployment and competitive gameplay

### SAFARI DYNAMIC CONTENT SYSTEM ✅ MVP1.5 COMPLETE

**Major Feature Addition: Safari Dynamic Content Management System MVP1.5**
- **🦁 Safari Submenu**: Complete dynamic content management interface in Production Menu
- **🎛️ Manage Safari Buttons**: Reorganized submenu with button management capabilities following shop/item patterns
- **✏️ Edit Existing Button**: Button selection dropdown with comprehensive edit functions (Properties, Actions, Delete)
- **📝 Create Custom Button**: Modal-driven button creation with action configuration (display_text, update_currency, follow_up_button)
- **📤 Post Custom Button**: Channel selection workflow for posting interactive buttons to any text channel
- **💰 Manage Currency**: Complete currency management with view all balances, set player currency, and reset all functionality
- **📊 View All Buttons**: Comprehensive listing of created buttons with usage statistics and metadata
- **🚀 Dynamic Execution**: Real-time button interaction handling with action chaining and currency updates
- **🔧 Conditional Actions**: Advanced conditional logic system with currency_gte conditions and success/failure actions

**MVP1.5 Status:** ✅ PRODUCTION READY
- All core functionality implemented and tested
- Complete admin interface with intuitive workflows
- Player interaction system fully functional
- Currency management system operational
- Button management interface following established patterns
- Dynamic handler pattern exclusions implemented
- Conditional action system with basic currency logic
- Ready for community deployment and feedback

# ORIGINAL TEXT PROMPT
Only refer to the following instructions if trying to clarify a requirement. Otherwise, where there is ambiguity, always refer to the content above this line as the source of truth.

I would like you to help me design / architect a new capability for CastBot, that will help enable two upcoming features. Originally I was considering these two features separately, but upon reflection I realise they involve the usage of the same types of user interface, data storage and interactions between UI and backend. Please include in Claude.MD instructions to refer to a new Safari.md file any time a prompt mentions Safari, Idol Hunt, Questions, or anything below that seems relevant. Create Safari.md based off of my prompt below and keep it up to date with the requirement, solution options (to meet the requirements), solution architecture (chosen high level solution option), releases (MVP1, MVP2, MVP3, MVPN.. - self contained releases), detailed design (functional design / interactions of the UI, data per each release, starting with MVP1), test cases and deployment steps.

Firstly, I'll describe the two features to give you some context:
1. Safari Builder: As CastBot is used in discord-based virtual versions of Reality Games (Online Reality Games - ORGs) - and particularly using the rules and format of the TV show Survivor, there is an opportunity to extend functionality to help hosts create what is often known as "Safaris" or "Idol Hunts", which are typically done manually with spreadsheets, limited bot-scripting languages and basic discord functionality. I would like to provide ORG game hosts (otherwise referred to admins / production) the ability to create and manage safaris through CastBot, saving them effort and creating an interactive player experience. In order to achieve this, it requires the ability to allow the /hosts/ to use the CastBot interface to create buttons which they can use CastBot to execute specific actions such as display text prepared by the hosts, generate Components with buttons that can act as shops, navigate to different areas of a virtual map, etc. This would also involve creating a currency system which in its MVP form can just be tracking currency against a user's entry in playerData.json. I also envisage some standard functionality like player currency management, custom item creation, assigning items to players, being able to buy items from stores etc. A key (nonMVP?) feature I would love is the ability for the user to upload an image (user created map for the safari) that is stored in the bot, and the bot automatically divides the map into coordinates.
2. Season Application Builder: This feature will involve extending the current 'Season Application' feature to allow hosts to create and edit an 'application process', which has its own per-application rules / behaviors defined, explanatory text, and allows hosts to create / update / edit questions that applicants will be presented for that season. As per current, hosts can then use Castbot to post an Season Application button (perhaps extended to a component which looks nicer) to a specified channel, and then any user with access to that channel can click the button to open a new channel. Once they open the channel, the questions defined by the hosts will be presented to any user applying. The bot must be able to capture and store their responses on a per-question basis - most likely by parsing messages between different questions (messages) the bot posts, and the player must be able to use the bot to easily move between questions and update their answers as needed. The data for the player's responses will then be used for a variety of future features, such as extending the existing Cast Ranking functionality to be richer.

So.. what is the common link between these two very different sounding features? Well, in essence they're both allowing end users to dynamically create and manage **content** from within the bot - user-defined Discord Components v2 such as text display, buttons, thumbnails, gallery, possibly even specific roles. For the Season Application feature they can leverage this to build dynamic application processes driven out of discord channels, defining questions as text and saving per season. For Safari Builder, they can define guided journeys that players can go on, helping them make turn-based moves, make in-game purchases from host-defined stores, with host defined-currencies on a per-season basis.

What are some of our design principles?
* Highly re-usable, well-documented functionality that you in particular are able to easily understand and continue to build upon. There is a good chance I'll use this core functionality to build something new.
* Starting with a 'Lean MVP' but architecting it right, building toward more rich and complex functionality and technical architectures. I want to get something up and running in the next few hours!	
* Alignment to the existing CastBot UX patterns which is usage of a the Container component, with nested buttons, selects and other components V2 control. Please ensure you refer to docs/features/ComponentsV2.md for the Components V2 API reference.
* Integration with the existing CastBot functionality, particularly the playerData.json player management approach. This is one area I'd rather not go too crazy with changing as I don't want to impact live users. If applicable we can maintain linkages between files using discord user ID as a common identifier, though I am concerned with possible user / player identification issues.

What do I want for MVP1? The core technical plumbing to allow a production user for their server's prod menu to:
* Create a sub-menu called "Safari" in prod menu (ensure to never include more than 5 buttons in an actionrow) to house the new functionality below.
* Create a custom button with a custom label and emoji (note a basic version has already been implemented with Season Applications > Create Application Process), and allows them to define N number of custom button actions for that button
* A custom button action "display text" feature, that allows the host to set a title and text associated with that button, displayed inside a Container component. When the button is clicked, it will display that component in the channel it was clicked.
* A custom button action "update currency" feature, that allows the host to enter a positive or negative value. When clicked, it will look up the user that clicked the button's currency (most likely just a single JSON field stored against the existing player ID in playerData.json), and update the user's currency value accordingly, never dropping to zero.
* A custom button action "follow-up button" which allows the host to select an existing custom button they've already defined. When the user clicks the "initial" custom button, a new message will be posted the in the channel with the "follow up" custom button.
* The host can then save the custom button and all of the associated actions. Then, inside the "Safari" menu, another "Post custom button" action allows them to select a custom button, and a channel. CastBot will post the custom button into the channel they select (note this functionality is already partially implemented in the Season Applications menu / Create Application button, feel free to re-use / redesign according to design principles.

Now can you please:
* Come up with an overarching technical design for this entire feature
* Where there are multiple viable solution options per a particular topic or area, present me the options and considerations
* Ask me any questions to clarify the requirements
* Defined a proposed MVP solution based on above.