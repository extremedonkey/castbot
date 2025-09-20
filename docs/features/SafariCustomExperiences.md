# Safari Custom Experiences: Complete Design Document

## Overview

**Safari Custom Experiences** extends the existing Safari Custom Action Editor to enable creation of configurable challenge systems, allowing administrators to replicate and customize the existing Safari Rounds functionality through the Custom Actions framework.

Currently, Safari has a hardcoded "Tycoons" challenge system embedded in the Safari Rounds feature. This design enables complete configurability while maintaining backwards compatibility.

## Current Safari System Analysis

### Safari Round Resolution Order (As Discovered)

The existing Safari system (`processRoundResults()` in `safariManager.js:2847`) follows this precise sequence:

1. **Yield/Harvest Calculation (First)**
   - Calculate earnings from player inventories based on round event
   - Determine event type (good/bad) using `calculateRoundProbability()`
   - Add earnings to player currency (`player.currency + totalEarnings`)

2. **Attack Resolution (Second)**
   - Process all queued attacks via `processAttackQueue()`
   - Calculate defense using `calculateTotalDefense()` from player inventories
   - Apply damage (attack damage - defense, minimum 0) to defending players
   - Consume attack items marked as consumable

3. **Data Persistence (Third)**
   - Save updated player data after earnings, damage, and item consumption
   - Clear processed attack queue for the round

4. **Display Generation (Fourth)**
   - Generate round results via `createRoundResultsV2()`
   - Show player-by-player earnings, attacks, and balance changes

**Key Finding:** Earnings are calculated and applied BEFORE attacks are resolved, preventing scenarios where attacks could reduce earnings below intended amounts.

### Safari Custom Action Editor Architecture (As Discovered)

The existing Custom Action system provides:

#### Trigger Types
- **🔘 Button Trigger (`trigger.type: 'button'`)** - Player clicks button on coordinates
- **💬 Modal/Text Input Trigger (`trigger.type: 'modal'`)** - Player types specific phrases
- **📋 Select Menu Trigger (`trigger.type: 'select'`)** - Not yet implemented

#### Condition System
- **Currency Conditions** - `>=`, `<=`, or `= 0` comparisons
- **Item Conditions** - Has/doesn't have specific items
- **Role Conditions** - Has/doesn't have Discord roles
- **Logic Operators** - AND/OR with short-circuit evaluation

#### Action Execution Paths
- **`executeOn: 'true'`** - Execute when ALL conditions are met
- **`executeOn: 'false'`** - Execute when conditions FAIL

#### Current Action Types
- **Display Text** - Formatted messages with optional colors/images
- **Give Currency** - Add/subtract currency
- **Give Item** - Grant items to inventory
- **Give/Remove Role** - Manage Discord roles
- **Follow-up Action** - Chain to other Custom Actions

### Probability Calculation System (As Discovered)

Safari uses linear interpolation for event probabilities across any number of rounds:

- **Configuration**: Only 3 values needed (`round1GoodProbability: 70`, `round2GoodProbability: 50`, `round3GoodProbability: 30`)
- **Algorithm**: `calculateRoundProbability()` interpolates between start/mid/end points
- **Scaling**: Works for 1-50+ rounds using piecewise linear interpolation
- **Random Roll**: `Math.random() * 100 < goodEventProbability` determines event type

### Harvest Storage Analysis (As Discovered)

**Critical Finding**: Calculated harvests are NOT stored permanently anywhere.

- **Temporary Storage**: `playerResults` array exists only during `processRoundResults()` execution
- **Immediate Application**: Earnings applied directly to `player.safari.currency`
- **Display Only**: Round results show calculations then discard intermediate data
- **No Audit Trail**: `storeRoundResult()` function exists but is never called
- **Reset Behavior**: `roundHistory` array cleared during game resets

## Proposed Extensions

### 1. New Trigger Type: "Round Changed"

**Purpose**: Enable Custom Actions to respond to Safari round progression events.

**Technical Requirements**:
- Trigger executes when `safari_process_round` button clicked or scheduled execution occurs
- Preserves channel context for message posting (manual vs scheduled execution)
- Passes round number, guild context, and event timing to Custom Actions
- Maintains backwards compatibility with existing round buttons

**Implementation Approach**:
```javascript
// New trigger type in Custom Action editor
trigger: {
  type: 'round_changed',
  config: {
    roundScope: 'any' | 'specific' | 'range',
    specificRounds: [1, 2, 3], // if roundScope === 'specific'
    roundRange: { min: 1, max: 5 } // if roundScope === 'range'
  }
}
```

**Context Preservation**:
- Channel ID where round button was clicked
- Guild ID and round number
- Manual vs scheduled execution flag
- Player list and current game state

### 2. New Action Type: "Determine Event"

**Purpose**: Replace hardcoded probability calculation in `processRoundResults()`.

**Configuration Options**:
```javascript
{
  type: 'determine_event',
  config: {
    probabilitySource: 'safari_config' | 'custom' | 'conditional',
    customProbabilities: {
      round1: 70,
      round2: 50,
      round3: 30
    },
    conditionalLogic: [
      { condition: 'round >= 5', probability: 10 },
      { condition: 'players < 10', probability: 80 }
    ],
    goodEvent: {
      name: 'Clear Skies',
      emoji: '☀️',
      message: 'The skies are clear! All creatures thrive!'
    },
    badEvent: {
      name: 'Meteor Strike',
      emoji: '☄️',
      message: 'Meteors rain down! Only the protected survive!'
    }
  }
}
```

**Output**: Sets round context variables (`eventType`, `eventName`, `eventEmoji`) for subsequent actions.

### 3. New Action Type: "Calculate Results"

**Purpose**: Extract player earnings calculation from `processRoundResults()` into a simple, triggerable Custom Action.

**SIMPLIFIED CORE IMPLEMENTATION (MANDATORY)**:
```javascript
{
  type: 'calculate_results',
  config: {
    // No configuration needed for core functionality
    // Uses goodOutcomeValue from all items by default
  }
}
```

**Core Functionality**:
- Calculate earnings for all eligible Safari players
- Use `goodOutcomeValue` from item definitions (no event system dependency)
- Update player currency balances via existing `updateCurrency()` function
- Silent execution - no messages or UI output required
- Triggered by Custom Action button click

**OPTIONAL FUTURE ENHANCEMENTS**:
```javascript
{
  type: 'calculate_results',
  config: {
    eventSource: 'determine_event' | 'force_good' | 'force_bad', // Advanced event handling
    playerScope: 'all_eligible' | 'role_filtered' | 'condition_filtered', // Player filtering
    roleFilters: ['Cast Member', 'VIP'], // Role-based restrictions
    earningsFormula: 'item_based' | 'flat_rate' | 'custom', // Custom calculation methods
    flatRate: { good: 100, bad: -50 }, // Non-item-based earnings
    customFormula: 'currency = inventory.sword * 10 + inventory.shield * 5' // Advanced formulas
  }
}
```

**Technical Implementation**:
- **MANDATORY**: Extract basic earnings calculation logic from `processRoundResults()`
- **MANDATORY**: Support existing `goodOutcomeValue` calculations from item definitions
- **MANDATORY**: Update player currency via existing `updateCurrency()` function
- **OPTIONAL**: Event type handling (good/bad outcomes)
- **OPTIONAL**: Player scope filtering and role restrictions
- **OPTIONAL**: Custom formula support for non-standard challenges
- **OPTIONAL**: Integration with "Determine Event" actions for context chaining

### 4. New Action Type: "Calculate Attack"

**Purpose**: Replace attack resolution system from `processRoundResults()`.

**Configuration Options**:
```javascript
{
  type: 'calculate_attack',
  config: {
    processQueue: true,
    consumeItems: true,
    defenseCalculation: 'item_based' | 'flat_rate' | 'custom',
    damageFormula: 'attack - defense, min 0' | 'custom',
    customDefenseFormula: 'defense = inventory.shield * 2',
    attackScope: 'current_round' | 'all_pending' | 'specific_rounds'
  }
}
```

**Technical Implementation**:
- Extract `processAttackQueue()` logic
- Extract `consumeAttackItems()` logic
- Extract `calculateTotalDefense()` logic
- Maintain attack queue data structure
- Support custom damage/defense calculations for non-Tycoons challenges

### 5. New Action Type: "Display Results"

**Purpose**: Replace `createRoundResultsV2()` functionality with configurable display options.

**Configuration Options**:
```javascript
{
  type: 'display_results',
  config: {
    displayMode: 'detailed' | 'summary' | 'custom',
    includeHarvest: true,
    includeAttacks: true,
    includeRankings: false,
    customTemplate: '## Round {round} Results\n{playerResults}',
    roleGrouping: true,
    maxPlayersShown: 10,
    channelTarget: 'trigger_channel' | 'specific_channel' | 'dm_players'
  }
}
```

**Technical Implementation**:
- Extract display logic from `createRoundResultsV2()`
- Support multiple message posting via Discord API
- Maintain role grouping and player card formatting
- Enable custom templating for different challenge types

### 6. New Condition Type: "Round Condition" (Lower Priority)

**Purpose**: Enable round-specific Custom Action execution.

**Configuration Options**:
```javascript
{
  type: 'round',
  operator: 'gte' | 'lte' | 'eq' | 'ne' | 'in_range',
  value: 3,
  range: { min: 2, max: 5 }
}
```

**Use Cases**:
- Final round special actions
- Mid-game mechanic changes
- Progressive difficulty adjustments

### 7. Location System Improvements (Lower Priority)

**Issues Identified**:
- Custom Actions created outside coordinates have broken back buttons
- Text Input triggers without locations don't activate from any location
- Global Custom Actions need location-agnostic operation

**Solutions**:
- Fix back button navigation for global Custom Actions
- Enable text input triggers to work from any Safari location
- Improve Custom Action location assignment UI

## Experience Templates Concept (Future Enhancement)

While current Custom Actions can meet immediate needs, future "Experience Templates" could provide:

**Template Structure**:
```javascript
experienceTemplates: {
  "tycoons_classic": {
    name: "Tycoons Challenge",
    description: "Classic Safari tycoon experience with resource management",
    emoji: "🏭",
    author: "CastBot Official",
    version: "1.0",
    difficulty: "Medium",
    estimatedDuration: "30-45 minutes",
    recommendedPlayers: "5-20",
    actions: [
      { actionId: "determine_event_tycoons", trigger: "round_changed" },
      { actionId: "calculate_harvest_tycoons", trigger: "round_changed" },
      { actionId: "calculate_attack_tycoons", trigger: "round_changed" },
      { actionId: "display_results_tycoons", trigger: "round_changed" }
    ],
    metadata: {
      tags: ["resource_management", "pvp", "economics"],
      createdAt: 1640995200000,
      usageCount: 150
    }
  }
}
```

**Future Vision**: Online Reality Game challenge system where communities can share and discover experience templates.

## Implementation Strategy

### MANDATORY CORE IMPLEMENTATION (1-2 hours)
**Goal**: Basic "Calculate Results" action that can be triggered by button click

**Tasks**:
1. **Extract calculation logic**: Create `calculateSimpleResults()` function from `processRoundResults()`
2. **Add action type**: Register "calculate_results" in Custom Action editor
3. **Add execution handler**: Handle action execution in `executeButtonActions()`
4. **Button registration**: Add to `BUTTON_REGISTRY` in `buttonHandlerFactory.js`

**Success Criteria**:
- Custom Action can be created with "calculate_results" type
- Button click triggers earnings calculation for all eligible players
- Player currency updated using existing `updateCurrency()` function
- Uses `goodOutcomeValue` from item definitions by default

### OPTIONAL FUTURE PHASES (Advanced Features)

#### Phase 1: Enhanced Action Types (3-4 weeks)
1. **Week 1**: "Determine Event" action + testing
2. **Week 2**: Enhanced "Calculate Results" with event source configuration
3. **Week 3**: "Calculate Attack" action + attack queue integration
4. **Week 4**: "Display Results" action + Discord API integration

#### Phase 2: Trigger System (2 weeks)
1. **Week 1**: "Round Changed" trigger implementation
2. **Week 2**: Context preservation + button integration

#### Phase 3: Integration & Testing (2 weeks)
1. **Week 1**: End-to-end Custom Experience creation
2. **Week 2**: Backwards compatibility testing + documentation

#### Phase 4: Polish & Advanced Features (1-2 weeks)
1. Round conditions implementation
2. Location system improvements
3. Experience template foundations

## Technical Architecture

### Data Flow
```
Round Button Click/Schedule
  ↓
Trigger "Round Changed" Custom Actions
  ↓
Execute in sequence:
  1. Determine Event → Sets event context
  2. Calculate Harvest → Updates player currency
  3. Calculate Attack → Processes attacks
  4. Display Results → Shows round results
```

### Context Management
```javascript
// Shared context between actions
const roundContext = {
  guildId: "123456789",
  channelId: "987654321",
  currentRound: 2,
  totalRounds: 3,
  isScheduled: false,
  eventType: "good", // Set by Determine Event
  eventName: "Clear Skies", // Set by Determine Event
  eventEmoji: "☀️", // Set by Determine Event
  playerResults: [], // Set by Calculate Harvest
  attackResults: [], // Set by Calculate Attack
  eligiblePlayers: [...]
};
```

### Integration Points
- **Button Handlers**: `safari_process_round` in `app.js`
- **Scheduled Execution**: `executeSafariRoundResults()` function
- **Player Data**: Existing `playerData.json` and `updateCurrency()`
- **Safari Config**: Existing `safariContent.json` structure
- **Discord API**: Message posting and interaction handling

## Migration Strategy

### Backwards Compatibility
- **Existing Safari Rounds**: Continue to work unchanged during development
- **Data Preservation**: No modifications to existing `safariContent.json` structure
- **Parallel Operation**: New Custom Experience system operates alongside existing system
- **User Choice**: Administrators can choose Classic Rounds or Custom Experiences

### Testing Strategy
1. **Unit Testing**: Each new action type tested independently
2. **Integration Testing**: Full round processing comparison (old vs new)
3. **User Acceptance Testing**: Beta guilds test Custom Experiences alongside Classic Rounds
4. **Performance Testing**: Ensure new system matches existing performance benchmarks

### Rollback Strategy
- **System Toggle**: Instant fallback to Classic Rounds if issues arise
- **Data Isolation**: Custom Experiences data stored separately from Classic Rounds
- **Error Isolation**: Custom Experience failures don't affect Classic Rounds operation

## Success Criteria

### Functional Requirements
- [ ] Custom Actions can replicate exact existing Safari Rounds behavior
- [ ] Round progression triggers Custom Actions correctly
- [ ] Player currency calculations match existing system precisely
- [ ] Attack resolution produces identical results to current system
- [ ] Display output matches existing round results format
- [ ] Backwards compatibility maintained throughout development

### Performance Requirements
- [ ] Round processing time <= existing `processRoundResults()` performance
- [ ] Memory usage comparable to current system
- [ ] No degradation in Discord API response times
- [ ] Scalable to 50+ players and 10+ rounds

### User Experience Requirements
- [ ] Custom Experience creation intuitive for administrators
- [ ] Clear migration path from Classic Rounds to Custom Experiences
- [ ] Comprehensive documentation and examples provided
- [ ] Error messages clear and actionable
- [ ] Minimal learning curve for existing Safari administrators

## Future Enhancements

### Advanced Challenge Types
With this foundation, future challenge types become possible:
- **Survival Challenges**: Resource scarcity, elimination mechanics
- **Cooperative Challenges**: Team-based objectives, shared resources
- **Racing Challenges**: Speed-based competitions, time limits
- **Mystery Challenges**: Hidden information, deduction mechanics
- **Hybrid Challenges**: Combining multiple challenge types

### Community Features
- **Template Sharing**: Export/import Custom Experience configurations
- **Community Library**: Browse and discover challenge templates
- **Rating System**: Community ratings and reviews for templates
- **Tournaments**: Structured multi-guild competitive events

### Analytics Integration
- **Performance Metrics**: Track Custom Experience completion rates
- **Player Engagement**: Measure player participation and retention
- **Balance Analysis**: Identify overpowered or underpowered mechanics
- **Usage Patterns**: Popular template configurations and modifications

---

## Development Notes

**Started**: [Current Date] - Analysis and design phase
**Status**: Planning and documentation
**Next Steps**: Begin implementation with "Calculate Harvest" action as suggested
**Tracking**: Progress will be tracked in CLAUDE.md implementation section

This system represents a significant architectural advancement for Safari, enabling complete configurability while maintaining the stability and familiarity of the existing system.