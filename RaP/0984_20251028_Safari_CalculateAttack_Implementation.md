# Safari Calculate Attack Custom Action - Complete Implementation Guide

**RaP Number**: 0984
**Date**: 2025-10-28
**Status**: 🚧 Implementation Ready
**Complexity**: Medium (4-6 hours)
**Risk Level**: Medium (modifies attack/defense core logic)

---

## 🎯 Original Context: Trigger Prompt

**User Request:**
> "Do any of the documents talk about 'breaking up' the former 'Tycoons' game into programmable custom actions - we started this slightly with calculate_results which has a portion of safari_round_results (the 'calculation' of results), but not the attack or defense resolution or ordering. Basically I want to implement a new custom action that calculates the attack / defense results and subtracts the appropriate amount of money based on the existing logic encoded within safari_rounds_results."

**User Requirements:**
1. Mirror Calculate Results UI (nearly identical except attack-specific configuration)
2. Main config: All Players vs. Just the executing player
3. Option A for scope/error handling (simple, sensible defaults)
4. Add configurable display option: Silent vs. Display Text (with attack/defense results container)
5. Zero-context implementation document for future Claude instances

---

## 📚 Essential Documentation References

### Primary Context
- **[SafariCustomExperiences.md](../features/SafariCustomExperiences.md)** - Lines 231-256: Calculate Attack specification
- **[SafariCustomExperiences.md](../features/SafariCustomExperiences.md)** - Lines 11-34: Round resolution order (Harvest → Attack → Save → Display)
- **[SafariCustomExperiences.md](../features/SafariCustomExperiences.md)** - Lines 320-343: Tycoons template with all 4 actions

### Attack/Defense Logic (Current Implementation)
- **safariManager.js:6399-6505** - `processAttackQueue()` function
- **safariManager.js:6515-6577** - `consumeAttackItems()` function
- **safariManager.js:6376-6388** - `calculatePlayerDefense()` function
- **safariManager.js:6025-6116** - `scheduleAttack()` (how attacks are queued)

### UI Standards & Patterns
- **[ComponentsV2.md](../standards/ComponentsV2.md)** - Discord Components V2 architecture (MANDATORY)
- **[LeanUserInterfaceDesign.md](../ui/LeanUserInterfaceDesign.md)** - Visual/UX standards
- **[MenuSystemArchitecture.md](../enablers/MenuSystemArchitecture.md)** - Menu patterns (UPDATE_MESSAGE, no flags)
- **[ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md)** - Button registration patterns

### Calculate Results Pattern (MIRROR THIS)
- Search production logs for: `safari_action_type_select` → `calculate_results`
- File: `customActionUI.js` - Calculate Results entity editor
- File: `safariActionExecutor.js` - Calculate Results execution handler

---

## 🤔 Problem Statement

### The Monolithic Round Processing Problem

Currently, `safari_round_results` (safariManager.js:~2847 `processRoundResults()`) is a monolithic function that does 4 things:

```
processRoundResults() {
  1. Calculate Harvest/Yield (✅ EXTRACTED as calculate_results)
  2. Process Attack Queue    (❌ STILL MONOLITHIC - we need this!)
  3. Save Player Data        (shared infrastructure)
  4. Display Results         (future: display_results action)
}
```

**Why Extract Attack Processing?**
1. **Configurability**: Different challenge types may have different attack mechanics
2. **Composability**: Admins can build custom round flows (e.g., attacks before earnings, or no attacks)
3. **Testability**: Attack logic can be tested independently
4. **Maintainability**: Smaller, focused functions are easier to debug

---

## 🏛️ Historical Context: The Tycoons Story

Safari originally shipped with a hardcoded "Tycoons" challenge:
- Players collect items that generate currency each round
- Players attack each other to steal currency
- Defense items reduce incoming damage

**The Evolution:**
- ✅ **Phase 1**: Extracted `calculate_results` (harvest/yield calculation) - COMPLETE
- 🚧 **Phase 2**: Extract `calculate_attack` (attack/defense resolution) - THIS DOCUMENT
- ⏳ **Phase 3**: Extract `determine_event` (good/bad probability) - FUTURE
- ⏳ **Phase 4**: Extract `display_results` (round results UI) - FUTURE

**End Goal**: Complete configurability through Custom Actions, enabling:
- Tycoons (economic warfare)
- Survival (resource scarcity)
- Cooperative (team objectives)
- Racing (speed competitions)
- Mystery (hidden information)

---

## 📊 Attack/Defense Resolution Logic

### Complete Flow: Wainer Attacks Morgane Example

#### Initial Setup

**Wainer's Inventory** (playerData.json):
```json
"444637942988668938": {
  "safari": {
    "currency": 500,
    "inventory": {
      "raider_123": {
        "quantity": 3,
        "numAttacksAvailable": 3
      }
    }
  }
}
```

**Morgane's Inventory** (playerData.json):
```json
"977455730300956683": {
  "safari": {
    "currency": 800,
    "inventory": {
      "shield_456": {
        "quantity": 2,
        "numAttacksAvailable": 0
      }
    }
  }
}
```

**Item Definitions** (safariContent.json):
```json
{
  "items": {
    "raider_123": {
      "name": "Raider",
      "emoji": "⚔️",
      "attackValue": 50,
      "consumable": "Yes"
    },
    "shield_456": {
      "name": "Shield",
      "emoji": "🛡️",
      "defenseValue": 30
    }
  }
}
```

---

### Phase 1: Attack Scheduling (Mid-Round)

**Location**: safariManager.js:6025 `scheduleAttack()`

**Pseudocode**:
```python
function scheduleAttack(attackerId: Wainer, targetId: Morgane, itemId: "raider_123", quantity: 2):
    # Validate attacker has attacks available
    attacksAvailable = attackerInventory["raider_123"].numAttacksAvailable  # = 3
    if attacksAvailable < quantity:  # 3 >= 2? YES
        return ERROR("Not enough attacks")

    # Calculate total damage
    item = safariContent.items["raider_123"]
    totalDamage = quantity * item.attackValue  # = 2 * 50 = 100

    # Create attack record
    attackRecord = {
        attackingPlayer: "444637942988668938",
        attackingPlayerName: "wainer",
        defendingPlayer: "977455730300956683",
        itemId: "raider_123",
        itemName: "Raider",
        attacksPlanned: 2,
        attackValue: 50,
        totalDamage: 100,
        round: 1
    }

    # Queue attack in safariContent.json
    safariContent.attackQueue["round1"].push(attackRecord)

    # Reserve attacks
    attackerInventory["raider_123"].numAttacksAvailable -= 2  # 3 - 2 = 1

    save(playerData)
    save(safariContent)
```

**Data Changes**:
```json
// playerData.json - Wainer
"raider_123": {
  "quantity": 3,
  "numAttacksAvailable": 1  // ← CHANGED: 3 → 1 (2 reserved)
}

// safariContent.json - Attack Queue
"attackQueue": {
  "round1": [{
    "attackingPlayer": "444637942988668938",
    "defendingPlayer": "977455730300956683",
    "totalDamage": 100,
    "attacksPlanned": 2
  }]
}
```

---

### Phase 2: Attack Resolution (Round Processing)

**Location**: safariManager.js:6399 `processAttackQueue()`

**Pseudocode**:
```python
function processAttackQueue(guildId, currentRound: 1):
    # Load attack queue
    attackQueue = safariContent.attackQueue["round1"]

    # Group attacks by defender
    attacksByDefender = {
        "977455730300956683": [  # Morgane
            { totalDamage: 100, attackingPlayer: Wainer }
        ]
    }

    # Process each defender
    for (defenderId: Morgane, attacks) in attacksByDefender:
        defender = playerData[guildId].players[Morgane]

        # Calculate total incoming damage
        totalAttackDamage = sum(attack.totalDamage for attack in attacks)  # = 100

        # Calculate defender's defense
        totalDefense = calculatePlayerDefense(defender.safari.inventory, items)
        # = shield_456.defenseValue * quantity
        # = 30 * 2 = 60

        # Calculate net damage (attack - defense, min 0)
        netDamage = max(0, totalAttackDamage - totalDefense)
        # = max(0, 100 - 60) = 40

        # Apply damage to currency
        originalCurrency = defender.safari.currency  # = 800
        defender.safari.currency = max(0, originalCurrency - netDamage)
        # = max(0, 800 - 40) = 760

        # Store result for display
        attackResults.push({
            defenderId: Morgane,
            defenderName: "morgane",
            totalAttackDamage: 100,
            totalDefense: 60,
            damageDealt: 40,
            originalCurrency: 800,
            newCurrency: 760,
            attackers: [
                { name: "wainer", damage: 100, itemName: "Raider", quantity: 2 }
            ]
        })

    return attackResults
```

**Defense Calculation** (safariManager.js:6376):
```python
function calculatePlayerDefense(playerInventory, items):
    totalDefense = 0

    for (itemId, itemData) in playerInventory:
        item = items[itemId]
        if item.defenseValue:
            quantity = itemData.quantity
            totalDefense += (item.defenseValue * quantity)

    return totalDefense

# For Morgane:
# shield_456: defenseValue=30, quantity=2
# totalDefense = 30 * 2 = 60
```

**Data Changes**:
```json
// playerData.json - Morgane
"977455730300956683": {
  "safari": {
    "currency": 760  // ← CHANGED: 800 → 760 (-40 damage)
  }
}
```

---

### Phase 3: Item Consumption

**Location**: safariManager.js:6515 `consumeAttackItems()`

**Pseudocode**:
```python
function consumeAttackItems(attackQueue, playerData, guildId, items):
    for attack in attackQueue:
        item = items[attack.itemId]

        # Only consume if item is consumable
        if item.consumable != "Yes":
            continue

        attacker = playerData[guildId].players[attack.attackingPlayer]
        inventoryItem = attacker.safari.inventory[attack.itemId]

        # Calculate new quantity
        originalQuantity = inventoryItem.quantity  # = 3
        newQuantity = max(0, originalQuantity - attack.attacksPlanned)
        # = max(0, 3 - 2) = 1

        # Update inventory
        inventoryItem.quantity = newQuantity

        consumptionResults.push({
            attackerId: Wainer,
            playerName: "wainer",
            itemName: "Raider",
            quantityConsumed: 2
        })

    return consumptionResults
```

**Data Changes**:
```json
// playerData.json - Wainer
"raider_123": {
  "quantity": 1,  // ← CHANGED: 3 → 1 (2 consumed)
  "numAttacksAvailable": 1
}
```

---

### Phase 4: Queue Cleanup

**Location**: safariManager.js:6585 `clearProcessedAttackQueue()`

**Pseudocode**:
```python
function clearProcessedAttackQueue(guildId, currentRound: 1):
    delete safariContent[guildId].attackQueue["round1"]
    save(safariContent)
```

**Data Changes**:
```json
// safariContent.json
"attackQueue": {}  // ← CHANGED: "round1" deleted
```

---

### Key Formulas

```python
# Total Attack Damage
totalAttackDamage = Σ(attack.attacksPlanned * item.attackValue)

# Total Defense
totalDefense = Σ(inventory[item].quantity * item.defenseValue)

# Net Damage (can't be negative)
netDamage = max(0, totalAttackDamage - totalDefense)

# Currency Update (can't go below 0)
newCurrency = max(0, oldCurrency - netDamage)

# Item Consumption (only if consumable == "Yes")
newQuantity = max(0, oldQuantity - attacksPlanned)
```

---

## 🎨 User Interface Design

### Mirroring Calculate Results Pattern

**Entry Point**: Custom Action Editor → Add Action → String Select → "⚔️ Calculate Attack"

**Configuration Screen** (mirrors calculate_results exactly):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ⚔️ Calculate Attack Configuration
Configure attack processing behavior
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **`🎯 Player Scope`**

┌─────────────────────────────────────┐
│ All Players ✓                       │ ← String Select
│ ├─ All Players                      │   (default: All Players)
│ └─ Executing Player Only            │
└─────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **`📊 Display Mode`**

┌─────────────────────────────────────┐
│ Silent ✓                            │ ← String Select
│ ├─ Silent (no output)               │   (default: Silent)
│ └─ Display Text (show results)      │
└─────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[⚡ ← Back] [💾 Save]
```

---

### Container Structure (Components V2)

```javascript
{
  type: 17, // Container
  accent_color: 0xf39c12, // Orange (Safari theme)
  components: [
    // Header
    {
      type: 10, // Text Display
      content: "## ⚔️ Calculate Attack Configuration\nConfigure attack processing behavior"
    },
    { type: 14 }, // Separator

    // Player Scope Section
    {
      type: 10,
      content: "> **`🎯 Player Scope`**"
    },
    {
      type: 1, // Action Row
      components: [{
        type: 3, // String Select
        custom_id: `safari_action_calculate_attack_scope_${actionId}_${actionIndex}`,
        placeholder: "Select player scope...",
        options: [
          {
            label: "All Players",
            value: "all_players",
            description: "Process attacks for all eligible players",
            emoji: { name: "👥" },
            default: true
          },
          {
            label: "Executing Player Only",
            value: "executing_player",
            description: "Process only the player who triggered this action",
            emoji: { name: "👤" }
          }
        ]
      }]
    },
    { type: 14 }, // Separator

    // Display Mode Section
    {
      type: 10,
      content: "> **`📊 Display Mode`**"
    },
    {
      type: 1, // Action Row
      components: [{
        type: 3, // String Select
        custom_id: `safari_action_calculate_attack_display_${actionId}_${actionIndex}`,
        placeholder: "Select display mode...",
        options: [
          {
            label: "Silent",
            value: "silent",
            description: "No output, just process attacks",
            emoji: { name: "🔇" },
            default: true
          },
          {
            label: "Display Text",
            value: "display_text",
            description: "Show attack results in container",
            emoji: { name: "📊" }
          }
        ]
      }]
    },
    { type: 14 }, // Separator

    // Navigation
    {
      type: 1,
      components: [
        {
          type: 2,
          custom_id: `custom_action_editor_${actionId}`,
          label: "← Back",
          emoji: { name: "⚡" },
          style: 2
        },
        {
          type: 2,
          custom_id: `safari_action_calculate_attack_save_${actionId}_${actionIndex}`,
          label: "Save",
          emoji: { name: "💾" },
          style: 1
        }
      ]
    }
  ]
}
```

---

### Display Text Output (When Enabled)

**Pattern**: Mirror existing Tycoons attack display from `createRoundResultsV2()`

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ⚔️ Attack Results

> **`Morgane`**

**Attacks Received:**
⚔️ wainer used 2x Raider (100 damage)

**Defense:**
🛡️ 2x Shield (60 total defense)

**Result:**
💰 800 → 760 (-40)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> **`Wainer`**

**Items Consumed:**
⚔️ 2x Raider consumed (3 → 1)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Container Structure**:
```javascript
{
  type: 17,
  accent_color: 0xe74c3c, // Red (attack theme)
  components: [
    {
      type: 10,
      content: "## ⚔️ Attack Results"
    },
    { type: 14 },

    // For each defender with attacks
    {
      type: 10,
      content: `> **\\`${defenderName}\\`**\n\n` +
               `**Attacks Received:**\n` +
               `${attackSummary}\n\n` +
               `**Defense:**\n` +
               `${defenseSummary}\n\n` +
               `**Result:**\n` +
               `💰 ${originalCurrency} → ${newCurrency} (${changeText})`
    },
    { type: 14 },

    // For each attacker with consumed items
    {
      type: 10,
      content: `> **\\`${attackerName}\\`**\n\n` +
               `**Items Consumed:**\n` +
               `${consumptionSummary}`
    }
  ]
}
```

---

## 💾 Data Structures

### Custom Action Configuration (safariContent.json)

```json
{
  "guildId": {
    "buttons": {
      "tycoons_round_handler": {
        "id": "tycoons_round_handler",
        "name": "Process Round",
        "trigger": {
          "type": "button",
          "button": {
            "emoji": "🎲",
            "label": "Process Round",
            "style": "Primary"
          }
        },
        "actions": [
          {
            "type": "calculate_results",
            "order": 1,
            "config": {
              "playerScope": "all_players"
            }
          },
          {
            "type": "calculate_attack",
            "order": 2,
            "config": {
              "playerScope": "all_players",
              "displayMode": "silent"
            }
          }
        ]
      }
    }
  }
}
```

### Attack Queue Structure (safariContent.json)

```json
{
  "guildId": {
    "attackQueue": {
      "round1": [
        {
          "attackingPlayer": "444637942988668938",
          "attackingPlayerName": "wainer",
          "defendingPlayer": "977455730300956683",
          "itemId": "raider_123",
          "itemName": "Raider",
          "attacksPlanned": 2,
          "attackValue": 50,
          "totalDamage": 100,
          "timestamp": 1761652937000,
          "round": 1
        }
      ]
    }
  }
}
```

---

## 🔧 Implementation Steps

### Step 1: Register Action Type (15 min)

**File**: `customActionUI.js`

**Add to action type dropdown**:
```javascript
const actionTypeOptions = [
  // ... existing options
  {
    label: "Calculate Results",
    value: "calculate_results",
    description: "Calculate player earnings from inventory",
    emoji: { name: "📊" }
  },
  {
    label: "Calculate Attack", // ← NEW
    value: "calculate_attack",
    description: "Process attack queue and apply damage",
    emoji: { name: "⚔️" }
  }
];
```

**Add to action summary display**:
```javascript
function getActionSummary(action) {
  switch (action.type) {
    case 'calculate_results':
      return "📊 Calculate Results\n- Calculate player earnings from inventory";

    case 'calculate_attack': // ← NEW
      const scopeText = action.config?.playerScope === 'executing_player'
        ? 'Executing player only'
        : 'All players';
      const displayText = action.config?.displayMode === 'display_text'
        ? 'Display results'
        : 'Silent';
      return `⚔️ Calculate Attack\n- Scope: ${scopeText}\n- Display: ${displayText}`;
  }
}
```

---

### Step 2: Create Configuration UI (1 hour)

**File**: `customActionUI.js`

**Create configuration handler**:
```javascript
/**
 * Show Calculate Attack configuration UI
 * Mirrors calculate_results pattern exactly
 */
export async function showCalculateAttackConfig(res, actionId, actionIndex, guildId, existingConfig = {}) {
  const config = existingConfig.config || {
    playerScope: 'all_players',
    displayMode: 'silent'
  };

  const container = {
    type: 17,
    accent_color: 0xf39c12,
    components: [
      // Header
      {
        type: 10,
        content: "## ⚔️ Calculate Attack Configuration\nConfigure attack processing behavior"
      },
      { type: 14 },

      // Player Scope
      {
        type: 10,
        content: "> **`🎯 Player Scope`**"
      },
      {
        type: 1,
        components: [{
          type: 3,
          custom_id: `safari_action_calculate_attack_scope_${actionId}_${actionIndex}`,
          placeholder: "Select player scope...",
          options: [
            {
              label: "All Players",
              value: "all_players",
              description: "Process attacks for all eligible players",
              emoji: { name: "👥" },
              default: config.playerScope === 'all_players'
            },
            {
              label: "Executing Player Only",
              value: "executing_player",
              description: "Process only the player who triggered this action",
              emoji: { name: "👤" },
              default: config.playerScope === 'executing_player'
            }
          ]
        }]
      },
      { type: 14 },

      // Display Mode
      {
        type: 10,
        content: "> **`📊 Display Mode`**"
      },
      {
        type: 1,
        components: [{
          type: 3,
          custom_id: `safari_action_calculate_attack_display_${actionId}_${actionIndex}`,
          placeholder: "Select display mode...",
          options: [
            {
              label: "Silent",
              value: "silent",
              description: "No output, just process attacks",
              emoji: { name: "🔇" },
              default: config.displayMode === 'silent'
            },
            {
              label: "Display Text",
              value: "display_text",
              description: "Show attack results in container",
              emoji: { name: "📊" },
              default: config.displayMode === 'display_text'
            }
          ]
        }]
      },
      { type: 14 },

      // Navigation
      {
        type: 1,
        components: [
          {
            type: 2,
            custom_id: `custom_action_editor_${actionId}`,
            label: "← Back",
            emoji: { name: "⚡" },
            style: 2
          },
          {
            type: 2,
            custom_id: `safari_action_calculate_attack_save_${actionId}_${actionIndex}`,
            label: "Save",
            emoji: { name: "💾" },
            style: 1
          }
        ]
      }
    ]
  };

  return res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: {
      // NO FLAGS - UPDATE_MESSAGE inherits from original
      components: [container]
    }
  });
}
```

---

### Step 3: Add Button Handlers (30 min)

**File**: `app.js`

**Register buttons in BUTTON_REGISTRY** (`buttonHandlerFactory.js`):
```javascript
'safari_action_calculate_attack_scope': {
  label: 'Player Scope',
  description: 'Select player scope for attack calculation',
  category: 'safari_custom_actions'
},
'safari_action_calculate_attack_display': {
  label: 'Display Mode',
  description: 'Select display mode for attack results',
  category: 'safari_custom_actions'
},
'safari_action_calculate_attack_save': {
  label: 'Save',
  description: 'Save calculate attack configuration',
  category: 'safari_custom_actions'
}
```

**Scope selection handler**:
```javascript
} else if (custom_id.startsWith('safari_action_calculate_attack_scope_')) {
  return ButtonHandlerFactory.create({
    id: 'safari_action_calculate_attack_scope',
    handler: async (context) => {
      const parts = custom_id.split('_');
      const actionId = parts.slice(5, -1).join('_');
      const actionIndex = parseInt(parts[parts.length - 1]);
      const selectedScope = req.body.data.values[0];

      // Load and update config
      const safariData = await loadSafariContent();
      const action = safariData[guildId].buttons[actionId].actions[actionIndex];
      if (!action.config) action.config = {};
      action.config.playerScope = selectedScope;
      await saveSafariContent(safariData);

      // Refresh UI
      const { showCalculateAttackConfig } = await import('./customActionUI.js');
      return showCalculateAttackConfig(res, actionId, actionIndex, guildId, action);
    }
  })(req, res, client);
}
```

**Display mode selection handler**:
```javascript
} else if (custom_id.startsWith('safari_action_calculate_attack_display_')) {
  return ButtonHandlerFactory.create({
    id: 'safari_action_calculate_attack_display',
    handler: async (context) => {
      const parts = custom_id.split('_');
      const actionId = parts.slice(5, -1).join('_');
      const actionIndex = parseInt(parts[parts.length - 1]);
      const selectedDisplay = req.body.data.values[0];

      // Load and update config
      const safariData = await loadSafariContent();
      const action = safariData[guildId].buttons[actionId].actions[actionIndex];
      if (!action.config) action.config = {};
      action.config.displayMode = selectedDisplay;
      await saveSafariContent(safariData);

      // Refresh UI
      const { showCalculateAttackConfig } = await import('./customActionUI.js');
      return showCalculateAttackConfig(res, actionId, actionIndex, guildId, action);
    }
  })(req, res, client);
}
```

**Save handler**:
```javascript
} else if (custom_id.startsWith('safari_action_calculate_attack_save_')) {
  return ButtonHandlerFactory.create({
    id: 'safari_action_calculate_attack_save',
    handler: async (context) => {
      const parts = custom_id.split('_');
      const actionId = parts.slice(5, -1).join('_');
      const actionIndex = parseInt(parts[parts.length - 1]);

      // Config already saved by select handlers
      // Just return to Custom Action Editor
      const { showCustomActionEditor } = await import('./customActionUI.js');
      return showCustomActionEditor(res, actionId, guildId);
    }
  })(req, res, client);
}
```

---

### Step 4: Create Execution Handler (2 hours)

**File**: `safariActionExecutor.js`

**Main execution function**:
```javascript
/**
 * Execute Calculate Attack action
 * Processes attack queue and applies damage/defense resolution
 */
async function executeCalculateAttack(action, context) {
  console.log('⚔️ Executing Calculate Attack action');

  const { guildId, userId, client } = context;
  const config = action.config || {};
  const playerScope = config.playerScope || 'all_players';
  const displayMode = config.displayMode || 'silent';

  // Load data
  const safariData = await loadSafariContent();
  const playerData = await loadPlayerData();
  const currentRound = safariData[guildId]?.safariConfig?.currentRound || 1;
  const items = safariData[guildId]?.items || {};

  console.log(`⚔️ Processing attacks for round ${currentRound}, scope: ${playerScope}`);

  // Process attack queue
  const { attackResults, attackQueue } = await processAttackQueue(
    guildId,
    currentRound,
    playerData,
    items,
    client
  );

  console.log(`⚔️ Processed ${attackResults.length} defended players`);

  // Filter results by player scope if needed
  let filteredResults = attackResults;
  if (playerScope === 'executing_player') {
    filteredResults = attackResults.filter(result =>
      result.defenderId === userId ||
      result.attackers.some(a => a.attackerId === userId)
    );
    console.log(`⚔️ Filtered to ${filteredResults.length} results for executing player`);
  }

  // Consume attack items
  const consumptionResults = await consumeAttackItems(
    attackQueue,
    playerData,
    guildId,
    items
  );

  console.log(`⚔️ Consumed items for ${consumptionResults.length} attackers`);

  // Save player data
  await savePlayerData(playerData);
  console.log('⚔️ Player data saved after attack resolution');

  // Clear processed attack queue
  await clearProcessedAttackQueue(guildId, currentRound);
  console.log(`⚔️ Cleared attack queue for round ${currentRound}`);

  // Return results based on display mode
  if (displayMode === 'display_text') {
    return createAttackResultsDisplay(filteredResults, consumptionResults);
  }

  // Silent mode - no output
  return null;
}

/**
 * Create attack results display container
 * Mirrors Tycoons round results format
 */
function createAttackResultsDisplay(attackResults, consumptionResults) {
  const components = [
    {
      type: 10,
      content: "## ⚔️ Attack Results"
    },
    { type: 14 }
  ];

  // Add defender results
  for (const result of attackResults) {
    const attackSummary = result.attackers
      .map(a => `⚔️ ${a.name} used ${a.quantity}x ${a.itemName} (${a.damage} damage)`)
      .join('\n');

    const changeText = result.damageDealt > 0
      ? `-${result.damageDealt}`
      : '+0';

    components.push(
      {
        type: 10,
        content: `> **\`${result.defenderName}\`**\n\n` +
                 `**Attacks Received:**\n${attackSummary}\n\n` +
                 `**Defense:**\n🛡️ ${result.totalDefense} total defense\n\n` +
                 `**Result:**\n💰 ${result.originalCurrency} → ${result.newCurrency} (${changeText})`
      },
      { type: 14 }
    );
  }

  // Add consumption results
  const consumptionByPlayer = {};
  for (const consumption of consumptionResults) {
    if (!consumptionByPlayer[consumption.playerName]) {
      consumptionByPlayer[consumption.playerName] = [];
    }
    consumptionByPlayer[consumption.playerName].push(consumption);
  }

  for (const [playerName, consumptions] of Object.entries(consumptionByPlayer)) {
    const consumptionSummary = consumptions
      .map(c => `⚔️ ${c.quantityConsumed}x ${c.itemName} consumed (${c.originalQuantity} → ${c.newQuantity})`)
      .join('\n');

    components.push(
      {
        type: 10,
        content: `> **\`${playerName}\`**\n\n**Items Consumed:**\n${consumptionSummary}`
      },
      { type: 14 }
    );
  }

  return {
    type: 17,
    accent_color: 0xe74c3c, // Red (attack theme)
    components: components
  };
}
```

**Add to action executor switch statement**:
```javascript
case 'calculate_attack':
  return await executeCalculateAttack(action, context);
```

---

### Step 5: Testing Checklist (1 hour)

**Test Scenarios**:

1. **Configuration UI**
   - [ ] Select "All Players" scope - UI updates
   - [ ] Select "Executing Player" scope - UI updates
   - [ ] Select "Silent" display - UI updates
   - [ ] Select "Display Text" display - UI updates
   - [ ] Click Save - returns to Custom Action Editor
   - [ ] Action summary shows correct config

2. **Silent Execution (All Players)**
   - [ ] Queue 2 attacks: Wainer → Morgane, Reece → Wainer
   - [ ] Execute action
   - [ ] Verify Morgane currency reduced by net damage
   - [ ] Verify Wainer currency reduced by net damage
   - [ ] Verify attack items consumed if consumable
   - [ ] Verify defense items NOT consumed
   - [ ] Verify attack queue cleared
   - [ ] Verify no output displayed

3. **Display Text Execution (All Players)**
   - [ ] Queue attacks as above
   - [ ] Execute action with display mode = display_text
   - [ ] Verify attack results displayed
   - [ ] Verify defender section shows: attacks received, defense, result
   - [ ] Verify attacker section shows: items consumed
   - [ ] Verify all currency changes accurate

4. **Executing Player Scope**
   - [ ] Queue attacks: Wainer → Morgane, Reece → Wainer
   - [ ] Wainer executes action with scope = executing_player
   - [ ] Verify only Wainer's attacks/defenses processed
   - [ ] Verify Morgane's attacks NOT processed (Reece → Wainer ignored)
   - [ ] Verify display shows only Wainer-related results

5. **Edge Cases**
   - [ ] Empty attack queue - no error, silent success
   - [ ] Attack with 0 defense - full damage applied
   - [ ] Attack vs high defense - no damage (min 0)
   - [ ] Currency at 0 - stays at 0 (doesn't go negative)
   - [ ] Non-consumable attack item - quantity preserved

---

## ⚠️ Critical Pitfalls to Avoid

### 1. UPDATE_MESSAGE Flag Mistake
**❌ WRONG:**
```javascript
return res.send({
  type: InteractionResponseType.UPDATE_MESSAGE,
  data: {
    flags: (1 << 15), // ❌ Discord rejects this!
    components: [...]
  }
});
```

**✅ CORRECT:**
```javascript
return res.send({
  type: InteractionResponseType.UPDATE_MESSAGE,
  data: {
    // NO FLAGS - inherits from original message
    components: [...]
  }
});
```

---

### 2. Missing Await on Async Functions
**❌ WRONG:**
```javascript
const playerData = loadPlayerData(); // ❌ Returns Promise, not data!
```

**✅ CORRECT:**
```javascript
const playerData = await loadPlayerData(); // ✅ Resolves Promise
```

---

### 3. Forgetting to Save Data
**❌ WRONG:**
```javascript
defender.safari.currency -= netDamage;
// No save call - changes lost!
```

**✅ CORRECT:**
```javascript
defender.safari.currency -= netDamage;
await savePlayerData(playerData); // ✅ Persist changes
```

---

### 4. Processing Wrong Round's Attacks
**❌ WRONG:**
```javascript
const attackQueue = safariData.attackQueue["round1"]; // ❌ Hardcoded!
```

**✅ CORRECT:**
```javascript
const currentRound = safariData[guildId].safariConfig.currentRound;
const attackQueue = safariData.attackQueue[`round${currentRound}`]; // ✅ Dynamic
```

---

## 📊 Success Criteria

### Functional Requirements
- [ ] Action appears in Custom Action type dropdown
- [ ] Configuration UI matches Calculate Results pattern
- [ ] Player scope selection works (All Players / Executing Player)
- [ ] Display mode selection works (Silent / Display Text)
- [ ] Save returns to Custom Action Editor
- [ ] Action summary shows configuration
- [ ] Silent mode processes attacks without output
- [ ] Display Text mode shows formatted results
- [ ] All Players scope processes entire attack queue
- [ ] Executing Player scope filters to relevant attacks
- [ ] Attack damage calculated correctly (attack - defense, min 0)
- [ ] Currency updated correctly (can't go negative)
- [ ] Consumable items removed from inventory
- [ ] Non-consumable items preserved
- [ ] Attack queue cleared after processing
- [ ] Multiple defenders handled correctly
- [ ] Multiple attackers per defender grouped correctly

### Performance Requirements
- [ ] Execution time < 3 seconds for 20 players
- [ ] Memory usage comparable to processRoundResults()
- [ ] No degradation with 50+ queued attacks

### Code Quality Requirements
- [ ] All buttons registered in BUTTON_REGISTRY
- [ ] Follows ButtonHandlerFactory pattern
- [ ] Uses UPDATE_MESSAGE correctly (no flags)
- [ ] Proper error handling with try/catch
- [ ] Console logging for debugging
- [ ] Comments explain complex logic
- [ ] Matches Calculate Results code style

---

## 🔄 Integration with Existing System

### Backwards Compatibility
- ✅ Existing `safari_round_results` button unchanged
- ✅ `processRoundResults()` function still works
- ✅ Can use Custom Action OR legacy button (not both)
- ✅ Attack queue format unchanged
- ✅ Player data structure unchanged

### Future Enhancements
Once this is complete, the path is clear for:
1. **Display Results** action (extract `createRoundResultsV2()`)
2. **Determine Event** action (extract `calculateRoundProbability()`)
3. **Round Changed** trigger (execute actions on round progression)
4. **Complete Tycoons Template** (4 actions chained together)

---

## 📚 Related RaP Documents

- **[0985_20251027_Timezone_Role_Consolidation](./0985_20251027_Timezone_Role_Consolidation_Technical_Design.md)** - Similar entity configuration pattern
- **[0995_20251019_SafariRoleAction_DeletedRole](./0995_20251019_SafariRoleAction_DeletedRole_ErrorHandling.md)** - Safari error handling patterns

---

## 🎯 Summary: Zero-Context Implementation Checklist

**For Future Claude Code instances**, follow this sequence:

1. **Read this document completely** (you are here)
2. **Review Calculate Results implementation** (mirror this exactly)
3. **Register action type** in `customActionUI.js` (15 min)
4. **Create configuration UI** in `customActionUI.js` (1 hour)
5. **Add button handlers** in `app.js` + `buttonHandlerFactory.js` (30 min)
6. **Create execution handler** in `safariActionExecutor.js` (2 hours)
7. **Test all scenarios** from Testing Checklist (1 hour)
8. **Commit and deploy** using `./scripts/dev/dev-restart.sh` (MANDATORY)

**Total Estimated Time**: 4-6 hours

**Risk Assessment**: Medium (modifies core attack logic, but extracts existing code)

**Rollback Strategy**: Keep `safari_round_results` button intact - admins can switch back if issues arise

---

**🎭 The theater masks remind us**: This is both analysis (understanding attack mechanics) and storytelling (creating configurable challenge systems). Good documentation needs both technical precision and narrative context.

---

**End of Implementation Guide**

Update RaP counter to: **0983**
