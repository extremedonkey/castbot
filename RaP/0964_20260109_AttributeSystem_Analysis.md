# Attribute System Analysis & Design

## Original Context (Trigger Prompt)

> "ultrathink review any documentation that may be applicable to form the start of an attribute system, where things like HP, Strength, Dexterity and Mana [and potentially user-defined attributes] can be used in CastBot features such as the Safari (Custom Actions), assigned to players, assigned to items and potentially future enemies.
>
> Evaluate options for re-usability with the existing Stamina system (search for relevant documents)
>
> Consider if the @docs/enablers/EntityEditFramework.md is suitable to be used here and how we might use it"

---

## Executive Summary

**Great news**: CastBot already has 80% of the infrastructure needed for a comprehensive attribute system! The existing **Points Manager** (`pointsManager.js`) was explicitly designed for multiple point types including HP, Mana, and custom points. The **Item System** already has `attackValue`, `defenseValue`, and `staminaBoost` fields. The **Entity Edit Framework** can be extended to manage custom attribute definitions.

**Recommended Approach**: Extend the existing Points Manager into a full Attribute System rather than building something new.

---

## 1. Current System Analysis

### 1.1 Points Manager - The Foundation

**Location**: `/home/reece/castbot/pointsManager.js`

The Points Manager was **explicitly designed** to handle multiple point types beyond stamina. From the documentation:

```javascript
// From Attributes.md:
// "The Safari Points System is a flexible resource management framework"
// "Point Types: Stamina (Current Implementation), HP, Mana, Action Points, Custom Points"

// From pointsManager.js line 5-11:
/**
 * Points Manager for Safari System
 * Handles all point types (stamina, HP, mana, etc.) with timezone-safe regeneration
 * Uses on-demand calculation for efficient, maintenance-free operation
 */
```

**Key Functions Already Built**:
| Function | Purpose | Works for Any Point Type? |
|----------|---------|---------------------------|
| `initializeEntityPoints(guildId, entityId, pointTypes)` | Initialize points | ✅ Yes - accepts array |
| `getEntityPoints(guildId, entityId, pointType)` | Get current value | ✅ Yes |
| `usePoints(guildId, entityId, pointType, amount)` | Consume points | ✅ Yes |
| `hasEnoughPoints(guildId, entityId, pointType, amount)` | Check threshold | ✅ Yes |
| `addBonusPoints(guildId, entityId, pointType, amount)` | Add temporary boost | ✅ Yes |
| `setEntityPoints(guildId, entityId, pointType, current, max)` | Admin set | ✅ Yes |
| `getTimeUntilRegeneration(guildId, entityId, pointType)` | Display cooldown | ✅ Yes |

**Data Structure** (already supports any point type):
```json
{
  "guildId": {
    "entityPoints": {
      "player_391415444084490240": {
        "stamina": { "current": 1, "max": 1, "lastRegeneration": ..., "lastUse": ... },
        "hp": { "current": 100, "max": 100, "lastRegeneration": ..., "lastUse": ... },
        "mana": { "current": 50, "max": 50, "lastRegeneration": ..., "lastUse": ... }
      }
    }
  }
}
```

### 1.2 Item System - Existing Attribute Fields

**Location**: `/home/reece/castbot/safariManager.js`, `editFramework.js`

Items already have proto-attribute fields:

```javascript
// Item properties from editFramework.js and safariManager.js:
{
  "name": "Sword",
  "attackValue": 10,       // ← Already exists! Combat damage modifier
  "defenseValue": 5,       // ← Already exists! Defense modifier
  "staminaBoost": 1,       // ← Already exists! Stamina increase
  "consumable": "No",      // ← Determines if item is permanent equipment
  "goodOutcomeValue": 5,   // ← Challenge game yield bonus
  "badOutcomeValue": 2     // ← Challenge game yield bonus
}
```

### 1.3 Custom Actions - Already Has Point Conditions

**Existing Condition Types** (from `safariManager.js`):
```javascript
CONDITION_TYPES = {
  POINTS_GTE: 'points_gte',    // Check if entity has >= N points
  POINTS_LTE: 'points_lte',    // Check if entity has <= N points
  CAN_MOVE: 'can_move',        // Stamina-specific shorthand
  // ... other conditions
}
```

**Existing Action Types**:
- `check_points` - Validate point threshold before proceeding
- `modify_points` - Add/subtract points (conceptually complete, may need implementation)

### 1.4 Entity Edit Framework - Structure Analysis

The framework supports these entity types:
- `BUTTON` (Custom Actions)
- `STORE`
- `ITEM`
- `MAP_CELL`
- `SAFARI_CONFIG`

**Adding a new entity type** requires:
1. Add to `EDIT_CONFIGS` in `editFramework.js`
2. Add case to `getEntityPath()` in `entityManager.js`
3. Add case to `loadEntities()` in `entityManager.js`
4. Update UI in `entityManagementUI.js`

---

## 2. Proposed Attribute System Architecture

### 2.1 Core Concepts

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ATTRIBUTE SYSTEM LAYERS                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐       │
│  │  DEFINITIONS    │   │   INSTANCES     │   │   MODIFIERS     │       │
│  │  (Templates)    │   │   (On Entities) │   │   (From Items)  │       │
│  ├─────────────────┤   ├─────────────────┤   ├─────────────────┤       │
│  │ • HP            │   │ player_123      │   │ Sword (+5 ATK)  │       │
│  │ • Mana          │   │   hp: 100/100   │   │ Shield (+10 DEF)│       │
│  │ • Strength      │   │   mana: 50/50   │   │ Horse (+1 STA)  │       │
│  │ • Dexterity     │   │   str: 15       │   │ Ring (+5 MANA)  │       │
│  │ • [Custom...]   │   │   dex: 12       │   │                 │       │
│  └─────────────────┘   └─────────────────┘   └─────────────────┘       │
│          │                      │                      │                │
│          └──────────────────────┴──────────────────────┘                │
│                                 │                                       │
│                    ┌────────────▼────────────┐                         │
│                    │   ATTRIBUTE MANAGER     │                         │
│                    │   (Extended Points Mgr) │                         │
│                    └────────────┬────────────┘                         │
│                                 │                                       │
│          ┌──────────────────────┼──────────────────────┐               │
│          ▼                      ▼                      ▼               │
│  ┌───────────────┐    ┌─────────────────┐    ┌─────────────────┐       │
│  │ SAFARI CUSTOM │    │   ITEM SYSTEM   │    │  FUTURE: COMBAT │       │
│  │    ACTIONS    │    │   (Equipment)   │    │     ENEMIES     │       │
│  └───────────────┘    └─────────────────┘    └─────────────────┘       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Attribute Categories

**Resource Attributes** (consumable, regenerate):
- HP, Mana, Stamina, Energy, Action Points
- Have `current` and `max` values
- Support regeneration mechanics
- Can be spent/consumed

**Stat Attributes** (static, modified by equipment):
- Strength, Dexterity, Intelligence, Constitution
- Single value (no current/max split)
- Modified by equipped items
- Used in calculations

### 2.3 Proposed Data Structures

#### Attribute Definition (Template)
```json
{
  "guildId": {
    "attributeDefinitions": {
      "hp": {
        "id": "hp",
        "name": "Hit Points",
        "emoji": "❤️",
        "category": "resource",           // "resource" or "stat"
        "defaultMax": 100,
        "defaultValue": 100,              // For stats: the base value
        "regeneration": {
          "type": "incremental",          // "full_reset", "incremental", "none"
          "interval": 3600000,            // 1 hour in ms
          "amount": 10                    // Regen 10 HP per interval
        },
        "display": {
          "visibility": "bar",            // "hidden", "bar", "numbers"
          "showInMenu": true,
          "order": 1
        },
        "metadata": {
          "createdBy": "userId",
          "createdAt": 1704067200000,
          "isBuiltIn": true               // System-provided vs user-defined
        }
      },
      "strength": {
        "id": "strength",
        "name": "Strength",
        "emoji": "💪",
        "category": "stat",
        "defaultValue": 10,
        "regeneration": { "type": "none" },
        "display": {
          "visibility": "numbers",
          "showInMenu": true,
          "order": 5
        }
      }
    }
  }
}
```

#### Player Attributes Instance
```json
{
  "guildId": {
    "entityPoints": {
      "player_391415444084490240": {
        "stamina": { "current": 1, "max": 1, ... },
        "hp": { "current": 95, "max": 100, "lastRegeneration": ..., "lastUse": ... },
        "mana": { "current": 30, "max": 50, ... },
        "strength": { "value": 15 },
        "dexterity": { "value": 12 }
      }
    }
  }
}
```

#### Item Attribute Modifiers
```json
{
  "sword_12345": {
    "name": "Iron Sword",
    "attributeModifiers": [
      { "attributeId": "strength", "modifier": 5, "type": "add" },
      { "attributeId": "attackValue", "modifier": 10, "type": "add" }
    ],
    "attributeRequirements": [
      { "attributeId": "strength", "minimum": 8 }
    ]
  }
}
```

---

## 3. Entity Edit Framework Integration

### 3.1 When to Use Entity Edit Framework

**✅ USE for Attribute Definitions** (the templates):
- Full CRUD operations needed
- Complex field validation
- Admin interface with multiple properties
- Multi-step editing workflows

**❌ DON'T USE for Attribute Instances** (values on players):
- Simple number display/edit
- No complex relationships
- Already handled by Points Manager
- Player Admin UI already exists

### 3.2 Proposed EDIT_CONFIG for Attributes

```javascript
// Add to editFramework.js
[EDIT_TYPES.ATTRIBUTE_DEFINITION]: {
  displayName: 'Attribute',
  properties: {
    name: { type: 'text', maxLength: 30, required: true, label: 'Attribute Name' },
    emoji: { type: 'text', maxLength: 10, required: false, label: 'Emoji', placeholder: '❤️' },
    category: {
      type: 'select',
      options: ['resource', 'stat'],
      required: true,
      label: 'Category',
      description: 'Resource (has current/max, can regen) or Stat (single value)'
    },
    defaultMax: { type: 'number', min: 1, max: 9999, required: false, label: 'Default Maximum' },
    defaultValue: { type: 'number', min: 0, max: 9999, required: false, label: 'Default Value' },
    regenerationType: {
      type: 'select',
      options: ['none', 'full_reset', 'incremental'],
      required: false,
      label: 'Regeneration Type'
    },
    regenerationInterval: { type: 'number', min: 1, max: 1440, required: false, label: 'Regen Interval (minutes)' },
    regenerationAmount: { type: 'number', min: 1, max: 9999, required: false, label: 'Regen Amount' },
    visibility: {
      type: 'select',
      options: ['hidden', 'bar', 'numbers'],
      required: false,
      label: 'Display Mode'
    },
    showInMenu: {
      type: 'select',
      options: ['Yes', 'No'],
      required: false,
      label: 'Show in Player Menu'
    }
  },
  content: {
    type: 'interactions',
    label: 'Custom Action Integrations',
    maxItems: 10,
    itemLabel: 'integration',
    itemLabelPlural: 'integrations'
  },
  operations: ['edit', 'delete', 'add']
}
```

---

## 4. Implementation Plan

### Phase 1: Foundation (Extend Points Manager)

**Goal**: Support multiple attribute types without breaking stamina

**Changes**:
1. Rename conceptually: "Points Manager" → "Attribute Manager" (keep file for backward compat)
2. Add `category` support (resource vs stat)
3. Add attribute definition storage in `safariContent.json`
4. Add `getDefaultPointsConfig()` extension for custom attributes

**Effort**: 4-6 hours

### Phase 2: Built-in Attributes

**Goal**: Add HP and Mana as system-provided attributes

**Changes**:
1. Add HP/Mana to default config with sensible defaults
2. Update `initializeEntityPoints()` to initialize all defined attributes
3. Add display in Player Menu (attribute bar/numbers)
4. Add Custom Action conditions: `hp_gte`, `hp_lte`, `mana_gte`, `mana_lte`

**Effort**: 6-8 hours

### Phase 3: Item Attribute Modifiers

**Goal**: Items can grant attribute bonuses

**Changes**:
1. Add `attributeModifiers` field to item schema
2. Extend `calculatePermanentStaminaBoost()` to generic `calculateAttributeModifiers()`
3. Update item edit UI to include attribute modifier fields
4. Show total attributes in inventory/player menu

**Effort**: 8-10 hours

### Phase 4: Admin UI (Entity Edit Framework)

**Goal**: Admins can create custom attributes

**Changes**:
1. Add `ATTRIBUTE_DEFINITION` to `EDIT_TYPES` and `EDIT_CONFIGS`
2. Add `attribute_definition` case to `entityManager.js`
3. Create attribute management UI
4. Add validation and limits

**Effort**: 10-12 hours

### Phase 5: Stat Attributes

**Goal**: Support non-resource stats (Strength, Dexterity)

**Changes**:
1. Add `stat` category handling (single value, no regen)
2. Level/progression system integration (optional)
3. Stat requirements for items
4. Stat-based calculations in Custom Actions

**Effort**: 8-10 hours

### Phase 6: Future Enemies

**Goal**: Enemies have attributes too

**Changes**:
1. Create enemy entity type
2. Initialize enemies with attributes
3. Combat resolution using attributes
4. Enemy templates/definitions

**Effort**: 12-16 hours

---

## 5. Stamina System Reusability Analysis

### 5.1 What We Can Reuse Directly

| Component | Reusable? | Notes |
|-----------|-----------|-------|
| `initializeEntityPoints()` | ✅ 100% | Already accepts any point type |
| `getEntityPoints()` | ✅ 100% | Works for any attribute |
| `usePoints()` | ✅ 100% | Consumption logic is generic |
| `hasEnoughPoints()` | ✅ 100% | Threshold checking is generic |
| `addBonusPoints()` | ✅ 100% | Temporary boost logic reusable |
| `setEntityPoints()` | ✅ 100% | Admin override is generic |
| `getTimeUntilRegeneration()` | ✅ 100% | Works for any regenerating attribute |
| `calculatePermanentStaminaBoost()` | ⚠️ 80% | Needs generalization to any attribute |
| `calculateRegenerationWithCharges()` | ⚠️ 70% | Needs stat-type handling |
| `getPointsDisplay()` | ⚠️ 60% | Needs custom attribute support |
| Charge tracking system | ✅ 100% | Can apply to any resource attribute |

### 5.2 What Needs Extension

1. **Configuration loading**: Currently hardcoded for stamina, needs dynamic attribute lookup
2. **Display generation**: Needs to handle multiple attributes
3. **Item modifier calculation**: Currently stamina-only
4. **Custom Action integration**: Needs dynamic attribute condition generation

### 5.3 Backward Compatibility

The current stamina system must continue working unchanged. Strategy:
- Keep `stamina` as a special built-in attribute
- Maintain current function signatures
- Add new optional parameters for other attributes
- Default to stamina behavior when attribute not specified

---

## 6. Decision Matrix

### Option A: Extend Points Manager (Recommended)

**Pros**:
- 80% infrastructure already exists
- Battle-tested regeneration and charge tracking
- Minimal new code
- Maintains backward compatibility
- Already integrated with Custom Actions

**Cons**:
- Some refactoring needed
- File/function naming could be clearer

### Option B: New Attribute System from Scratch

**Pros**:
- Clean architecture from start
- Can design ideal API

**Cons**:
- Duplicates existing Points Manager functionality
- More development time (3x estimated)
- Risk of regression bugs
- Need to re-implement all Custom Action integrations

### Option C: Separate Systems (Points + Stats)

**Pros**:
- Clear separation of concerns
- Resource attributes vs static stats handled differently

**Cons**:
- Two systems to maintain
- Confusing for admins
- More complex item modifier handling

**Recommendation**: **Option A** - Extend the Points Manager into a full Attribute Manager.

---

## 7. Mermaid Diagrams

### 7.1 Attribute System Class Diagram

```mermaid
classDiagram
    class AttributeDefinition {
        +string id
        +string name
        +string emoji
        +string category
        +number defaultMax
        +number defaultValue
        +RegenerationConfig regeneration
        +DisplayConfig display
        +Metadata metadata
    }

    class RegenerationConfig {
        +string type
        +number interval
        +number amount
    }

    class DisplayConfig {
        +string visibility
        +boolean showInMenu
        +number order
    }

    class AttributeInstance {
        +number current
        +number max
        +number value
        +timestamp lastRegeneration
        +timestamp lastUse
        +array charges
    }

    class AttributeModifier {
        +string attributeId
        +number modifier
        +string type
    }

    class Item {
        +string id
        +string name
        +AttributeModifier[] attributeModifiers
        +AttributeRequirement[] attributeRequirements
    }

    class AttributeRequirement {
        +string attributeId
        +number minimum
    }

    class Entity {
        +string entityId
        +Map~string, AttributeInstance~ attributes
    }

    AttributeDefinition "1" --> "1" RegenerationConfig
    AttributeDefinition "1" --> "1" DisplayConfig
    Entity "1" --> "*" AttributeInstance
    Item "1" --> "*" AttributeModifier
    Item "1" --> "*" AttributeRequirement
    AttributeModifier --> AttributeDefinition : references
    AttributeRequirement --> AttributeDefinition : references
    AttributeInstance --> AttributeDefinition : based on
```

### 7.2 Attribute Calculation Flow

```mermaid
flowchart TD
    A[Request Attribute Value] --> B{Is Resource Type?}

    B -->|Yes| C[Get Base Value from Instance]
    B -->|No| D[Get Stat Value from Instance]

    C --> E[Check Regeneration]
    E --> F{Time Elapsed >= Interval?}
    F -->|Yes| G[Apply Regeneration]
    F -->|No| H[Keep Current]

    G --> I[Calculate Item Modifiers]
    H --> I
    D --> I

    I --> J[Sum All Item Bonuses]
    J --> K[Apply Caps/Limits]
    K --> L[Return Final Value]

    subgraph Item Modifier Calculation
        J --> M[Scan Player Inventory]
        M --> N[Find Items with attributeModifiers]
        N --> O[Sum modifiers for this attribute]
        O --> J
    end
```

### 7.3 Custom Action Integration

```mermaid
sequenceDiagram
    participant CA as Custom Action
    participant AM as Attribute Manager
    participant PS as Player State
    participant IM as Item Modifiers

    CA->>AM: hasEnoughPoints(player, "mana", 20)
    AM->>PS: getEntityPoints(player, "mana")
    PS-->>AM: { current: 15, max: 50 }
    AM->>IM: calculateAttributeModifiers(player, "mana")
    IM-->>AM: +10 (from Magic Ring)
    AM-->>CA: false (15 + 10 = 25, but current is 15)

    Note over CA: Condition failed - not enough mana

    CA->>AM: modifyPoints(player, "mana", -20)
    AM->>PS: usePoints(player, "mana", 20)
    PS-->>AM: { success: false, message: "Insufficient points" }
    AM-->>CA: Action blocked
```

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking stamina system | Medium | High | Extensive testing, backward compat defaults |
| Over-engineering | Medium | Medium | Start with Phase 1-2, validate before Phase 3+ |
| Custom Action complexity | Low | Medium | Clear documentation, limited condition types |
| Performance (many attributes) | Low | Low | On-demand calculation already optimized |
| Admin confusion | Medium | Low | Good UI, built-in templates |

---

## 9. Recommended Next Steps

1. **Validate Design**: Share this document with stakeholder for feedback
2. **Create Feature Branch**: `feature/attribute-system`
3. **Phase 1 Implementation**: Extend Points Manager (4-6 hours)
4. **Testing**: Verify stamina still works, add HP/Mana
5. **Documentation Update**: Update Attributes.md → AttributeSystem.md
6. **Phase 2+**: Continue based on prioritization

---

## 10. Related Documentation

- [Attributes.md](../docs/features/Attributes.md) - Current stamina documentation
- [EntityEditFramework.md](../docs/enablers/EntityEditFramework.md) - Framework for custom attributes UI
- [SafariCustomActions.md](../docs/features/SafariCustomActions.md) - Custom Actions integration
- [StaminaItems.md](../docs/features/StaminaItems.md) - Item stamina boost patterns

---

## Appendix A: UI Mockups & Menu Integration

### A.1 Player Menu - Viewing Attributes

**Location**: `/menu` (for non-admins) → Player Menu

**Current State**: Shows profile info, vanity roles, global stores
**Proposed Addition**: New "📊 Your Stats" section or inline attribute display

```
┌─────────────────────────────────────────────────────────────────┐
│  🪪 Player Menu                                    [accent: blue]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ## Your Profile                                                 │
│  **Name:** @PlayerName                                          │
│  **Age:** 25 | **Pronouns:** They/Them                          │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  ## 📊 Your Stats                          ← NEW SECTION        │
│  ❤️ HP: ████████░░ 80/100                                       │
│  🔮 Mana: ██████░░░░ 30/50  (Regen: 2h 15m)                     │
│  ⚡ Stamina: Full                                                │
│  💪 Strength: 15 (+5 from Iron Sword)                           │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  [🎨 Edit Profile]  [🏷️ Vanity Roles]  [🧰 Inventory]           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation Notes**:
- Only shows attributes where `display.showInMenu: true`
- Sorted by `display.order`
- Shows item modifiers inline ("+5 from Iron Sword")
- Regeneration time shown for resource attributes not at max

### A.2 Admin Configuration - Tools Menu

**Location**: Production Menu → Tools (`prod_setup`) → **New Attributes button**

**Why Tools Menu?**
- Production Menu is at **40/40 component limit** (see RaP/0995)
- Tools Menu has room: Row 2 only has 2 buttons (Terms of Service, Privacy Policy)
- Thematically fits: Tools contains server configuration features

**Current Tools Menu Layout** (`menuBuilder.js`):
```
Row 1 (FULL - 5 buttons):
[🧙 Setup Wizard] [💜 Pronouns] [🔥 Tribes] [🕐 Availability] [❓ Help]

Row 2 (2 buttons - room for 3 more):
[📜 Terms of Service] [🔒 Privacy Policy]

Row 3:
[← Menu]
```

**Proposed Change**: Add "📊 Attributes" button to Row 2, LEFT of Terms of Service

```
┌─────────────────────────────────────────────────────────────────┐
│  🪛 CastBot | Tools                                [accent: blue]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Access the Setup Wizard for first-time setup, or manage        │
│  existing pronoun/timezone roles and other server config.       │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  [🧙 Setup Wizard] [💜 Pronouns] [🔥 Tribes] [🕐 Avail] [❓ Help]│
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  [📊 Attributes] [📜 Terms of Service] [🔒 Privacy Policy]      │
│        ↑ NEW                                                     │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  [← Menu]                                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Implementation**: Add to `menuBuilder.js` MENU_REGISTRY['setup_menu']:
```javascript
{
  type: 1, // ActionRow for legal buttons + Attributes
  components: [
    {
      type: 2, // Button - NEW
      custom_id: 'attribute_management',
      label: 'Attributes',
      style: 2, // Secondary (Grey)
      emoji: { name: '📊' }
    },
    {
      type: 2, // Button
      custom_id: 'prod_terms_of_service',
      label: 'Terms of Service',
      style: 2,
      emoji: { name: '📜' }
    },
    {
      type: 2, // Button
      custom_id: 'prod_privacy_policy',
      label: 'Privacy Policy',
      style: 2,
      emoji: { name: '🔒' }
    }
  ]
}
```

### A.3 Attributes Management UI

**Location**: Tools Menu → 📊 Attributes (new screen)

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Attribute Management                       [accent: purple] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ## Enabled Attributes                                           │
│                                                                  │
│  ❤️ **HP** (Hit Points)                              [Edit] [👁️]│
│     Resource | Max: 100 | Regen: 10/hour                        │
│                                                                  │
│  🔮 **Mana**                                         [Edit] [👁️]│
│     Resource | Max: 50 | Regen: Full reset/12h                  │
│                                                                  │
│  ⚡ **Stamina** *(Built-in)*                         [Edit] [🔒]│
│     Resource | Max: 1 | Regen: Full reset/720min                │
│                                                                  │
│  💪 **Strength**                                     [Edit] [👁️]│
│     Stat | Default: 10 | No regen                               │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  [➕ Create Attribute]  [📋 Presets]  [← Settings]              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

Legend: [👁️] = Visible to players | [🔒] = Cannot hide (core feature)
```

**Visibility Toggle**:
- Each attribute has a 👁️ button to show/hide from players
- Stamina is locked visible (core movement system)
- Hidden attributes still function in Custom Actions, just not displayed

### A.4 Global Defaults Configuration

**Location**: Code-level (`config/attributeDefaults.js`)

**Purpose**: Developer-only defaults for new server installs

```javascript
// config/attributeDefaults.js
export const GLOBAL_ATTRIBUTE_DEFAULTS = {
  // Built-in attributes (cannot be deleted, can be hidden)
  stamina: {
    id: 'stamina',
    name: 'Stamina',
    emoji: '⚡',
    category: 'resource',
    defaultMax: 1,
    isBuiltIn: true,
    canHide: false,  // Movement system requires this
    enabledByDefault: true
  },

  // Optional built-in attributes (hidden by default in new servers)
  hp: {
    id: 'hp',
    name: 'Hit Points',
    emoji: '❤️',
    category: 'resource',
    defaultMax: 100,
    isBuiltIn: true,
    canHide: true,
    enabledByDefault: false  // Hosts opt-in
  },

  mana: {
    id: 'mana',
    name: 'Mana',
    emoji: '🔮',
    category: 'resource',
    defaultMax: 50,
    isBuiltIn: true,
    canHide: true,
    enabledByDefault: false  // Hosts opt-in
  }
};

export const ATTRIBUTE_LIMITS = {
  MAX_CUSTOM_ATTRIBUTES: 10,
  MAX_ATTRIBUTE_NAME_LENGTH: 30,
  MAX_DEFAULT_VALUE: 9999
};
```

---

## Appendix B: Currency vs Attributes

### B.1 Should Currency Be an Attribute?

| Aspect | Currency | Attributes |
|--------|----------|------------|
| **Storage** | `playerData[guildId].players[userId].safari.currency` (number) | `safariContent[guildId].entityPoints[entityId][type]` (object) |
| **Has Max?** | No - unlimited accumulation | Yes - has `current` and `max` |
| **Regenerates?** | No | Yes (configurable) |
| **Consumed by actions?** | Yes (purchases) | Yes (abilities, movement) |
| **Multiple types?** | Currently no | Yes - designed for it |
| **Item modifiers?** | No | Yes (planned) |

### B.2 Recommendation: Keep Separate

**Don't merge currency into attributes** because:
1. Currency is intentionally unbounded (no max)
2. Currency doesn't regenerate
3. Different admin mental model ("economy" vs "character stats")
4. Already has different customization UI (name, emoji, starting value)
5. Migration complexity not worth the architectural purity

**However**, consider alignment in:
- Display patterns (show both in same "Player Stats" section)
- Custom Action syntax (similar condition/modify patterns)
- Future: Multiple currency types could borrow from attribute patterns

---

## Appendix C: Safari Custom Actions Integration

### C.1 Existing Integration Points

**Already Implemented** (in `safariManager.js`):
```javascript
// Condition: Check if player has enough points
case 'points_gte':
  const points = await getEntityPoints(guildId, entityId, condition.pointType || 'stamina');
  return points.current >= condition.value;

case 'points_lte':
  const points = await getEntityPoints(guildId, entityId, condition.pointType || 'stamina');
  return points.current <= condition.value;
```

### C.2 Proposed New Action Type: `modify_attribute`

**Purpose**: Change any attribute's current value

```javascript
// Action configuration in Custom Action editor
{
  "type": "modify_attribute",
  "order": 1,
  "executeOn": "true",
  "config": {
    "attributeId": "hp",           // Dropdown of enabled attributes
    "operation": "subtract",       // "add", "subtract", "set"
    "amount": 10,
    "message": "You took 10 damage!", // Optional display
    "allowNegative": false         // Can it go below 0?
  }
}
```

**UI in Custom Action Editor**:
```
┌─────────────────────────────────────────────────────────────────┐
│  Configure: Modify Attribute                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  **Select Attribute:**                                           │
│  [▼ ❤️ HP                    ]                                   │
│                                                                  │
│  **Operation:**                                                  │
│  [▼ Subtract                 ]                                   │
│                                                                  │
│  **Amount:** [____10____]                                        │
│                                                                  │
│  **Message (optional):**                                         │
│  [You took {amount} damage!________________]                     │
│                                                                  │
│  [✅ Save Action]  [❌ Cancel]                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### C.3 Dynamic Conditions per Attribute

When admin creates a custom attribute, automatically enable conditions:

```javascript
// If admin creates "luck" attribute, these become available:
'luck_gte'  // Luck >= value
'luck_lte'  // Luck <= value
'luck_eq'   // Luck == value (new)
```

---

## Appendix D: Recommended First Implementation ("Fun & Juicy")

### D.1 MVP Scope: Custom Attribute End-to-End

**Goal**: Prove the full loop works with minimal risk

**What We're Building**:
1. ✅ Admin creates custom attribute (name, emoji, max, regen)
2. ✅ Player views their attribute value
3. ✅ Admin modifies player's attribute (Player Admin)
4. ✅ Custom Action can modify the attribute

**What We're NOT Building Yet**:
- ❌ Item modifiers (Phase 3)
- ❌ Stat-type attributes (Phase 5)
- ❌ Built-in HP/Mana presets (can add later)
- ❌ Complex regeneration (incremental) - just full_reset

### D.2 Implementation Checklist

```
Phase 0: Foundation (2-3 hours)
├─ [ ] Create config/attributeDefaults.js
├─ [ ] Add attributeDefinitions to safariContent structure
├─ [ ] Modify getEntityPoints() to read custom attribute configs
└─ [ ] Test: Stamina still works unchanged

Phase 1: Admin Creates Attribute (3-4 hours)
├─ [ ] Add "📊 Attributes" button to Tools Menu (Row 2, left of Terms of Service)
├─ [ ] Create attribute list UI (shows enabled attributes)
├─ [ ] Add "Create Attribute" modal (name, emoji, max, regen type)
├─ [ ] Save to attributeDefinitions in safariContent
└─ [ ] Test: Create "Luck" attribute, verify saved

Phase 2: Player Views Attribute (2-3 hours)
├─ [ ] Add "📊 Your Stats" section to Player Menu
├─ [ ] Query player's entityPoints for all showInMenu attributes
├─ [ ] Display with progress bars/numbers per config
└─ [ ] Test: Player sees their Luck value

Phase 3: Admin Modifies Player Attribute (2-3 hours)
├─ [ ] Add attribute selector to Player Admin
├─ [ ] Create "Set Attribute" modal (select attribute, enter value)
├─ [ ] Call setEntityPoints() with selected attribute
└─ [ ] Test: Admin sets player's Luck to 50

Phase 4: Custom Action Integration (3-4 hours)
├─ [ ] Add "Modify Attribute" to action type dropdown
├─ [ ] Create config UI (attribute selector, operation, amount)
├─ [ ] Implement executeModifyAttribute() handler
├─ [ ] Add dynamic {attribute}_gte/{attribute}_lte conditions
└─ [ ] Test: Custom Action that adds +10 Luck on button click

Total: ~12-15 hours for complete end-to-end MVP
```

### D.3 Why This is Low Risk

1. **Stamina untouched initially** - We're adding alongside, not modifying
2. **Feature-flagged by creation** - Only servers that create attributes see them
3. **No migration needed** - New data structure, not changing existing
4. **Reversible** - Delete attribute definition = gone
5. **Small surface area** - 4 touch points, all isolated

### D.4 First Custom Attribute Suggestion: "Mana" or "Luck"

**Option A: Mana 🔮**
- Classic RPG resource
- Resource type (has max, regenerates)
- Use case: "Costs 5 Mana to cast a spell / activate ability"
- Distinct from Stamina (which is movement/actions)

**Option B: Luck 🍀**
- Fun and thematic for Survivor
- Stat type (single value, no regen)
- Use case: "Higher Luck = better item drops"

**Recommendation**: Start with **Mana** - it's a resource type which exercises more of the Points Manager code path, and the "costs X to do Y" pattern is immediately useful. Unlike "Energy" (too close to Stamina), Mana has a clear magical/ability connotation.

---

## Appendix E: Data Storage Decision

### E.1 Final Recommendation

| Data Type | Location | Rationale |
|-----------|----------|-----------|
| **Global defaults** | `config/attributeDefaults.js` | Code you control |
| **Server definitions** | `safariContent[guildId].attributeDefinitions` | Guild-scoped like items/stores |
| **Player instances** | `safariContent[guildId].entityPoints[entityId]` | Already exists, entity-agnostic |
| **Item modifiers** | Item definitions in `safariContent[guildId].items` | Extends existing item schema |

### E.2 No New JSON File Needed

Everything fits in existing `safariContent.json` structure:
```json
{
  "guildId": {
    "buttons": { ... },
    "stores": { ... },
    "items": { ... },
    "safariConfig": { ... },
    "entityPoints": { ... },        // ← Player attribute instances (exists)
    "attributeDefinitions": { ... } // ← NEW: Server's enabled attributes
  }
}
```

---

## Appendix F: Implementation Notes (Phase 0-3)

### F.1 Architecture Discovery: Two Player Admin Interfaces

**CRITICAL LEARNING**: CastBot has **TWO different Player Admin interfaces**:

| Interface | Button ID | File | Used For |
|-----------|-----------|------|----------|
| **Player Management** | `admin_set_*` buttons | `playerManagement.js` | Pronouns, Timezone, Age, Vanity Roles, **Stats** |
| **Safari Player Admin** | `safari_map_admin` | `safariMapAdmin.js` | Currency, Items, Map, Stamina |

The Safari "Player Admin" button in Production Menu → Safari says "Player Admin" but uses `custom_id: 'safari_map_admin'` and `createMapAdminUI()` - **NOT** `createPlayerManagementUI()`.

**Decision**: Stats/Attribute editing was implemented in **Player Management** only (not Safari Player Admin) since the plan is to eventually merge Safari Map Admin into Player Management.

**For future Claude instances**: When adding features to "Player Admin", check which interface context you're in!

### F.2 Critical Bug Fix: Points Manager Integration

When `setEntityPoints()` initializes a new point type, it looks for configuration in:
1. `safariData[guildId].attributeDefinitions[pointType]` (NEW - for custom attributes)
2. `safariData[guildId].pointsConfig.definitions[pointType]` (legacy fallback)
3. Default values (100/100)

**The bug**: The original code only checked `pointsConfig.definitions`, not `attributeDefinitions`, causing "Cannot read properties of undefined (reading 'defaultMax')" errors when initializing custom attributes like Mana.

**The fix** (`pointsManager.js:73-105`): Check `attributeDefinitions` first for custom attribute configs.

### F.3 Files Modified/Created

| File | Changes |
|------|---------|
| `config/attributeDefaults.js` | **NEW** - Preset definitions (Mana, HP, Strength, etc.) |
| `safariManager.js:438,470` | Added `attributeDefinitions: {}` to guild data structure |
| `safariManager.js:8202-8411` | Added CRUD functions: `getAttributeDefinitions`, `createAttributeDefinition`, etc. |
| `pointsManager.js:73-105` | **CRITICAL** - Fixed to read from `attributeDefinitions` for custom point types |
| `menuBuilder.js:68-75` | Added "📊 Attributes" button to Tools Menu (Row 2) |
| `playerManagement.js:17-19` | Added imports for attribute functions |
| `playerManagement.js:139-224` | NEW `createAttributeDisplaySection()` function |
| `playerManagement.js:279-289` | Added "Stats" button to admin management buttons |
| `playerManagement.js:363-373` | Integrated attribute display into Player Menu |
| `playerManagement.js:1186-1230` | Added `case 'attributes'` to `createHotSwappableSelect` |
| `app.js:6762-7082` | Attribute Management UI handlers |
| `app.js:20244` | Added `admin_set_attributes_` to handler pattern |
| `app.js:20284-20360` | Handler for `admin_integrated_attributes_` modal opening |
| `app.js:31744+` | Modal handler `modal_admin_set_attr_` |
| `buttonHandlerFactory.js:354-426` | Button registry entries for attribute buttons |

### F.4 Button ID Patterns

| Context | Button Pattern | Handler Location |
|---------|----------------|------------------|
| Tools Menu | `attribute_management` | `app.js:6762` |
| Attribute CRUD | `attr_add_custom`, `attr_enable_preset`, `attr_edit_select`, `attr_delete_*` | `app.js:6860-7207` |
| Player Management | `admin_set_attributes_{userId}` | `app.js:20244` → `handlePlayerButtonClick` |
| Attribute Select | `admin_integrated_attributes_{userId}` | `app.js:20284` |
| Modal | `modal_admin_set_attr_{userId}_{attrId}` | `app.js:31744` |

### F.4 Test Paths

**Admin Configure Attributes**:
```
/menu → Production Menu → 🪛 Tools → 📊 Attributes
  ├── ➕ Add Attribute (modal) → Create custom
  ├── ⚡ Enable Preset (select) → Enable Mana/HP/etc
  └── ✏️ Edit/Delete → Manage existing
```

**Admin Set Player Attributes (Safari)**:
```
/menu → Production Menu → Safari → 🧭 Player Admin
  → Select player → 📊 Stats button
  → Select attribute → Modal → Enter value
```

**Player View Attributes**:
```
/menu (as player) → Player Menu
  → "📊 Your Stats" section shows all server attributes
```

### F.5 Phase 4: Custom Action Integration (COMPLETED)

**Implementation**: `modify_attribute` action type added to Safari Custom Actions

**Files Changed**:
- `safariManager.js`: Added `MODIFY_ATTRIBUTE` to ACTION_TYPES, created `executeModifyAttribute()` function, added case to `executeButtonActions` switch
- `customActionUI.js`: Added dropdown option, label/summary helpers, created `showModifyAttributeConfig()` function
- `app.js`: Added `safari_action_type_select_` handler for `modify_attribute`, config select handlers (`safari_modify_attr_select_`, `safari_modify_attr_operation_`, etc.), modal handler (`modal_modify_attr_amount_`)
- `buttonHandlerFactory.js`: Added registry entries for new handlers

**Configuration Options**:
- **Attribute**: Select from server's defined attributes
- **Operation**: Add (increase), Subtract (decrease with cost check), Set (exact value)
- **Amount**: Configurable via modal
- **Display Mode**: Silent or show feedback to player
- **Execute On**: When conditions are true or false

**Test Path**:
```
Safari → Custom Actions → Edit action → Add action type dropdown
  → "📊 Modify Attribute" → Configure:
    - Select attribute (e.g., Mana)
    - Select operation (e.g., Subtract)
    - Set amount (e.g., 5)
    - Display mode (e.g., Show Feedback)
```

**Use Cases Enabled**:
- "Costs 5 Mana to use this ability" → Subtract operation with feedback
- "Healing potion grants +20 HP" → Add operation
- "Reset stamina to full" → Set operation to max value

---

## Appendix G: Phase 5 Implementation Plan - Item Attribute Modifiers

### G.1 Overview

**Goal**: Allow items to grant attribute bonuses (e.g., "Iron Sword: +5 Strength", "Magic Ring: +10 Mana Max")

**Status**: NOT IMPLEMENTED
**Estimated Effort**: 8-10 hours
**Dependencies**: Phases 0-4 completed ✅

### G.2 Current State Analysis

**Existing Item Attribute Fields** (from `editFramework.js:69-108`):
```javascript
{
  name: "Iron Sword",
  emoji: "⚔️",
  basePrice: 100,
  staminaBoost: 1,        // ← Special-cased for stamina only
  consumable: "No",
  attackValue: 10,        // ← Proto-attributes (unused?)
  defenseValue: 5,        // ← Proto-attributes (unused?)
  // NO generic attributeModifiers array yet
}
```

**Existing Stamina Boost Pattern** (from `pointsManager.js:15-39`):
```javascript
async function calculatePermanentStaminaBoost(guildId, entityId) {
    // Only works for players
    if (!entityId.startsWith('player_')) return 0;

    // Scans inventory for non-consumable items
    for (const [itemId, qty] of Object.entries(inventory)) {
        const item = items[itemId];
        if (item?.consumable === 'No' && item?.staminaBoost > 0) {
            totalBoost += item.staminaBoost;
        }
    }
    return totalBoost;
}
```

**Key Insight**: The pattern exists but is hardcoded for stamina. Need to generalize to ANY attribute.

### G.3 Proposed Data Structure

**Item Schema Extension**:
```json
{
  "iron_sword_12345": {
    "name": "Iron Sword",
    "emoji": "⚔️",
    "basePrice": 100,
    "consumable": "No",
    "staminaBoost": 0,
    "attributeModifiers": [
      { "attributeId": "strength", "value": 5, "operation": "add" },
      { "attributeId": "mana", "value": 10, "operation": "addMax" }
    ],
    "attributeRequirements": [
      { "attributeId": "strength", "minimum": 8, "message": "Requires 8 STR" }
    ]
  }
}
```

**Modifier Operations**:
| Operation | Effect | Example |
|-----------|--------|---------|
| `add` | Adds to current/value | +5 Strength (permanent stat boost) |
| `addMax` | Increases max capacity | +10 Max Mana (larger pool) |
| `multiply` | Percentage modifier | 1.5x Mana regen rate (future) |

### G.4 Implementation Checklist (File-Specific)

```
Phase 5.1: Core Infrastructure (2-3 hours)
├─ [ ] pointsManager.js:15-39 - Create `calculateAttributeModifiers(guildId, entityId, attributeId)`
│       → Returns { add: number, addMax: number } for all item bonuses
├─ [ ] pointsManager.js:148-200 - Integrate into `getEntityPoints()`
│       → Apply addMax to returned max value
│       → Keep `calculatePermanentStaminaBoost()` for backward compat
├─ [ ] pointsManager.js - Export new function
└─ [ ] Test: Stamina boost still works, new function returns correct values

Phase 5.2: Item Edit UI (3-4 hours)
├─ [ ] entityManagementUI.js:553-560 - Add 'stats' field group to getFieldGroups()
│       → stats: { label: 'Stats', emoji: '📊', fields: ['attributeModifiers'], useCustomUI: true }
├─ [ ] entityManagementUI.js:361-379 - Add attributeModifiers display in getEntityDetails()
│       → Show: "**📊 Attribute Bonuses**: +5 STR, +10 Max Mana"
├─ [ ] app.js:23252+ - Add case for 'stats' field group in entity_field_group_ handler
│       → Route to custom UI (like map_cell 'stores' handler pattern)
├─ [ ] app.js - NEW: Add handlers for item_attr_add_{itemId}, item_attr_select_{itemId}
├─ [ ] app.js - NEW: Add handlers for item_attr_edit_{itemId}_{attrId}, item_attr_remove_{itemId}_{attrId}
├─ [ ] app.js - NEW: Add modal handler modal_item_attr_{itemId}_{attrId}
├─ [ ] buttonHandlerFactory.js - Register new button IDs
└─ [ ] Test: Admin can add +5 Strength to Iron Sword, see it in item details

Phase 5.3: Player Display Integration (2-3 hours)
├─ [ ] playerManagement.js:139-224 - Update `createAttributeDisplaySection()`
│       → Import calculateAttributeModifiers from pointsManager.js
│       → For each attribute, get modifiers and add to display
│       → Show: "💪 Strength: 20 *(+5 from items)*"
├─ [ ] playerManagement.js - Build item name aggregation for bonus display
│       → Track which items contribute to each attribute
│       → Show: "💪 Strength: 20 *(+3 Iron Sword, +2 Power Ring)*"
└─ [ ] Test: Player sees stat bonuses from equipped items in /menu

Phase 5.4: Attribute Requirements (Optional - 2 hours)
├─ [ ] editFramework.js:69-108 - Add attributeRequirements to ITEM schema
├─ [ ] safariManager.js - Add requirement check in item use/give logic
├─ [ ] entityManagementUI.js - Show requirements in item detail view
├─ [ ] app.js - Add UI for configuring requirements (similar to modifiers)
└─ [ ] Test: Can't use "Dragon Sword" without 20 STR
```

**Files Summary**:
| File | Changes |
|------|---------|
| `pointsManager.js` | New `calculateAttributeModifiers()`, integrate into `getEntityPoints()` |
| `entityManagementUI.js` | Add 'stats' field group, display modifiers in item details |
| `playerManagement.js` | Show item bonuses in Player Menu stats section |
| `app.js` | New handlers for item attribute modifier CRUD |
| `buttonHandlerFactory.js` | Register new button IDs |
| `editFramework.js` | (Optional Phase 5.4) Add attributeRequirements to schema |

### G.5 Code Changes

**File: `pointsManager.js`** - New generic function:
```javascript
/**
 * Calculate total attribute modifiers from player's non-consumable items
 * @param {string} guildId - Guild ID
 * @param {string} entityId - Entity ID (player_123)
 * @param {string} attributeId - Attribute to calculate (strength, mana, etc.)
 * @returns {Object} { add: number, addMax: number }
 */
async function calculateAttributeModifiers(guildId, entityId, attributeId) {
    if (!entityId.startsWith('player_')) return { add: 0, addMax: 0 };

    const playerId = entityId.replace('player_', '');
    const playerData = await loadPlayerData();
    const safariData = await loadSafariContent();

    const inventory = playerData[guildId]?.players?.[playerId]?.safari?.inventory || {};
    const items = safariData[guildId]?.items || {};

    let result = { add: 0, addMax: 0 };

    for (const [itemId, qty] of Object.entries(inventory)) {
        const item = items[itemId];
        if (item?.consumable === 'No' && item?.attributeModifiers) {
            for (const modifier of item.attributeModifiers) {
                if (modifier.attributeId === attributeId) {
                    const operation = modifier.operation || 'add';
                    result[operation] = (result[operation] || 0) + modifier.value;
                }
            }
        }
    }

    // Backward compatibility: staminaBoost → stamina add modifier
    if (attributeId === 'stamina') {
        const staminaBoost = await calculatePermanentStaminaBoost(guildId, entityId);
        result.addMax += staminaBoost;
    }

    return result;
}
```

**File: `editFramework.js`** - Add to ITEM properties:
```javascript
attributeModifiers: {
    type: 'attribute_modifiers',  // New custom field type
    label: 'Attribute Bonuses',
    description: 'Stat bonuses granted by this item',
    maxModifiers: 5
}
```

**File: `playerManagement.js`** - Update display:
```javascript
// In createAttributeDisplaySection()
const modifiers = await calculateAttributeModifiers(guildId, entityId, attrId);
const baseValue = currentPoints.current;
const totalValue = baseValue + modifiers.add;
const displayMax = currentPoints.max + modifiers.addMax;

// Build display with bonus indicator
let statLine = `${emoji} **${attrDef.name}**: ${totalValue}`;
if (modifiers.add > 0 || modifiers.addMax > 0) {
    const bonusParts = [];
    if (modifiers.add > 0) bonusParts.push(`+${modifiers.add}`);
    if (modifiers.addMax > 0) bonusParts.push(`+${modifiers.addMax} max`);
    statLine += ` *(${bonusParts.join(', ')} from items)*`;
}
```

### G.6 UI Integration: Fitting Into Existing Item System

#### G.6.1 Current Item Field Groups (`entityManagementUI.js:553-560`)

```javascript
// EXISTING field groups for items:
case 'item':
    return {
        info: { label: 'Item Info', emoji: '📝', fields: ['name', 'description'] },
        financials: { label: 'Financials', emoji: '💰', fields: ['basePrice', 'goodOutcomeValue', 'badOutcomeValue'] },
        battle: { label: 'Battle', emoji: '⚔️', fields: ['attackValue', 'defenseValue'] },
        properties: { label: 'Persistence', emoji: '🍏', fields: ['consumable', 'defaultItem'] },
        stamina: { label: 'Movement', emoji: '⚡', fields: ['staminaBoost', 'reverseBlacklist', 'consumable'] }
    };
```

#### G.6.2 Proposed Change: Add "Stats" Field Group

```javascript
// UPDATED field groups (add new 'stats' group):
case 'item':
    return {
        info: { label: 'Item Info', emoji: '📝', fields: ['name', 'description'] },
        financials: { label: 'Financials', emoji: '💰', fields: ['basePrice', 'goodOutcomeValue', 'badOutcomeValue'] },
        battle: { label: 'Battle', emoji: '⚔️', fields: ['attackValue', 'defenseValue'] },
        properties: { label: 'Persistence', emoji: '🍏', fields: ['consumable', 'defaultItem'] },
        stamina: { label: 'Movement', emoji: '⚡', fields: ['staminaBoost', 'reverseBlacklist', 'consumable'] },
        stats: { label: 'Stats', emoji: '📊', fields: ['attributeModifiers'], useCustomUI: true }  // ← NEW
    };
```

**Note**: `useCustomUI: true` flag indicates this field group uses multi-step UI (like Custom Actions) instead of a simple modal.

#### G.6.3 UI Flow: Item Edit Screen with Stats Button

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚔️ Iron Sword                                  [accent: blue]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  **Base Price**: 100 🪙                                         │
│  **Consumable**: No                                             │
│  **Stamina Boost**: 0                                           │
│  **📊 Attribute Bonuses**: +5 STR, +10 Max Mana    ← NEW LINE   │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  [📝 Item Info] [💰 Financials] [⚔️ Battle]                     │
│  [🍏 Persistence] [⚡ Movement] [📊 Stats]        ← NEW BUTTON  │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  [← Menu] [Player Qty]                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### G.6.4 UI Flow: Stats Field Group Selected (Components V2 Compliant)

When user clicks [📊 Stats], show attribute management UI.

**⚠️ CRITICAL: Components V2 Constraints (from ComponentsV2Issues.md):**
- Buttons MUST be inside ActionRows (no inline buttons with text)
- ActionRows: max 5 buttons OR 1 select menu
- Sections: ONLY ONE child component (despite docs claiming 1-3)
- Total components: max 40 (count recursively)

**Design Pattern**: Use Select Menus for managing existing modifiers (like Custom Actions pattern)

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚔️ Iron Sword | 📊 Stats                       [accent: blue]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ## 📊 Attribute Bonuses                                        │
│                                                                  │
│  Configure stat bonuses granted by this item.                   │
│  (Non-consumable items only)                                    │
│                                                                  │
│  **Current Bonuses:**                                           │
│  • 💪 Strength: +5                                              │
│  • 🔮 Mana: +10 max                                             │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ▼ Manage existing bonus...                                 ││
│  │  ────────────────────────────────────────────────────────── ││
│  │  💪 Strength (+5) - Edit or Remove                          ││
│  │  🔮 Mana (+10 max) - Edit or Remove                         ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  [➕ Add Bonus]                                                  │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  [📝 Info] [💰 Finance] [⚔️ Battle] [🍏 Persist] [⚡ Move] [📊 Stats]│
│                                                                  │
│  [← Menu]                                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Component Count (Stats UI):**
```
Container (type 17)                           = 1
├─ Text Display (header + current bonuses)    = 1
├─ Separator                                  = 1
├─ ActionRow (select menu)                    = 1
│   └─ String Select (manage existing)        = 1
├─ ActionRow (add button)                     = 1
│   └─ Button (Add Bonus)                     = 1
├─ Separator                                  = 1
├─ ActionRow (field groups - 6 buttons)       = 1
│   └─ Buttons x6                             = 6
└─ ActionRow (navigation)                     = 1
    └─ Button (← Menu)                        = 1
                                        ─────────
                                  TOTAL = 16 components ✅
```

**Note**: 6 field group buttons in one ActionRow exceeds 5-button limit!
**Fix**: Split into 2 ActionRows (3 buttons each)

**Revised Component Count:**
```
Container (type 17)                           = 1
├─ Text Display (header + current bonuses)    = 1
├─ Separator                                  = 1
├─ ActionRow (select menu)                    = 1
│   └─ String Select (manage existing)        = 1
├─ ActionRow (add button)                     = 1
│   └─ Button (Add Bonus)                     = 1
├─ Separator                                  = 1
├─ ActionRow 1 (field groups: Info, Finance, Battle) = 1
│   └─ Buttons x3                             = 3
├─ ActionRow 2 (field groups: Persist, Move, Stats)  = 1
│   └─ Buttons x3                             = 3
└─ ActionRow (navigation)                     = 1
    └─ Button (← Menu)                        = 1
                                        ─────────
                                  TOTAL = 18 components ✅ (well under 40)
```

#### G.6.5 UI Flow: Select Attribute to Add (Components V2)

When user clicks [➕ Add Bonus], show attribute selector:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚔️ Iron Sword | Add Attribute Bonus            [accent: green] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ## ➕ Add Attribute Bonus                                       │
│                                                                  │
│  Select an attribute to add a bonus for:                        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ▼ Select Attribute...                                      ││
│  │  ────────────────────────────────────────────────────────── ││
│  │  💪 Strength           (Not configured)                     ││
│  │  🔮 Mana               (Not configured)                     ││
│  │  ❤️ HP                 (Not configured)                     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  [← Back to Stats]                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Component Count:**
```
Container                                     = 1
├─ Text Display (instructions)                = 1
├─ ActionRow (select)                         = 1
│   └─ String Select                          = 1
└─ ActionRow (back button)                    = 1
    └─ Button                                 = 1
                                        ─────────
                                  TOTAL = 6 components ✅
```

**Note**: Stamina excluded from select - hint shown in Stats UI to use Movement tab.

#### G.6.6 UI Flow: Configure Bonus Value (Modal)

After selecting attribute, open modal. **Modals use different component rules!**

```
┌─────────────────────────────────────────────────────────────────┐
│  Configure Strength Bonus                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  **Bonus Amount** (Label component - type 18)                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  5                                                          ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  **Bonus Type** (Label component - type 18)                     │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ▼ Add to Value                                             ││
│  │  ● Add to Value - Increases stat value                      ││
│  │  ○ Add to Max - Increases maximum capacity                  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Modal Structure (uses Label components per ComponentsV2.md Sept 2025 update):**
```javascript
{
  type: InteractionResponseType.MODAL,
  data: {
    custom_id: `modal_item_attr_${itemId}_${attrId}`,
    title: `Configure ${attrName} Bonus`,
    components: [
      {
        type: 18, // Label (NEW modal wrapper)
        label: 'Bonus Amount',
        description: 'Enter positive number (e.g., 5 = +5 to stat)',
        component: {
          type: 4, // Text Input
          custom_id: 'bonus_value',
          style: 1, // Short
          placeholder: '5',
          required: true,
          max_length: 4
        }
      },
      {
        type: 18, // Label
        label: 'Bonus Type',
        component: {
          type: 3, // String Select (now allowed in modals!)
          custom_id: 'bonus_operation',
          options: [
            { label: 'Add to Value', value: 'add', description: 'Increases stat value', default: true },
            { label: 'Add to Max', value: 'addMax', description: 'Increases maximum capacity' }
          ]
        }
      }
    ]
  }
}
```

#### G.6.7 Button/Select ID Patterns (Components V2 Compliant)

**Design uses Select Menus instead of inline Edit/Remove buttons** (per ComponentsV2 constraints)

| Action | ID Pattern | Type | Handler |
|--------|------------|------|---------|
| Select Stats field group | `entity_field_group_item_{itemId}_stats` | Button | Existing `app.js:23252` |
| Manage existing bonus | `item_attr_manage_{itemId}` | String Select | NEW handler |
| Add new bonus | `item_attr_add_{itemId}` | Button | NEW handler |
| Select attribute to add | `item_attr_select_{itemId}` | String Select | NEW handler → opens modal |
| Configure bonus modal | `modal_item_attr_{itemId}_{attrId}` | Modal | NEW modal handler |
| Back to stats | `item_attr_back_{itemId}` | Button | Returns to stats UI |

**Select Menu Option Values for "Manage Existing":**
```javascript
// String Select options for managing existing bonuses
options: [
  { label: '💪 Strength (+5)', value: 'edit_strength', description: 'Edit or remove this bonus' },
  { label: '🔮 Mana (+10 max)', value: 'edit_mana', description: 'Edit or remove this bonus' },
  { label: '🗑️ Remove All Bonuses', value: 'remove_all', description: 'Clear all attribute bonuses' }
]
```

**After Select → Show Edit/Remove UI:**
When user selects an attribute from "Manage existing", show confirmation:
```
┌─────────────────────────────────────────────────────────────────┐
│  💪 Strength Bonus: +5                                          │
│                                                                  │
│  [✏️ Edit Value]  [🗑️ Remove]  [← Back]                          │
└─────────────────────────────────────────────────────────────────┘
```

**Component Count for Edit/Remove confirmation: 7 components ✅**

#### G.6.8 Item Detail Display Update (`entityManagementUI.js:361-379`)

```javascript
// EXISTING item display code:
if (entity.staminaBoost !== undefined && entity.staminaBoost !== null && entity.staminaBoost !== 0) {
    lines.push(`**Stamina Boost**: ${entity.staminaBoost}`);
}

// ADD NEW attribute modifiers display:
if (entity.attributeModifiers && entity.attributeModifiers.length > 0) {
    const attrDefs = safariData[guildId]?.attributeDefinitions || {};
    const modifierStrings = entity.attributeModifiers.map(mod => {
        const def = attrDefs[mod.attributeId];
        const emoji = def?.emoji || '📊';
        const name = def?.name || mod.attributeId;
        const opLabel = mod.operation === 'addMax' ? ' max' : '';
        return `${emoji}+${mod.value}${opLabel} ${name}`;
    });
    lines.push(`**📊 Attribute Bonuses**: ${modifierStrings.join(', ')}`);
}
```

### G.7 Player Stats Display with Item Bonuses

```
┌─────────────────────────────────────────────────────────────────┐
│  ## 📊 Your Stats                                               │
│                                                                  │
│  ❤️ HP: ████████░░ 80/100                                       │
│  🔮 Mana: ██████████ 50/60  *(+10 max from Magic Ring)*         │
│  ⚡ Stamina: ██ 2/2  *(+1 max from Horse)*                      │
│  💪 Strength: 20  *(+5 from Iron Sword)*                        │
│  🏃 Dexterity: 12                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### G.8 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking staminaBoost | Low | High | Keep backward compat, migrate gradually |
| Performance (many items) | Medium | Low | Cache attribute totals per request |
| Complex UI | Medium | Medium | Start with simple add-only, expand later |
| Modifier stacking abuse | Low | Low | Cap modifier totals per attribute |
| **40 component limit** | Medium | High | **Validate with `countComponents()` before deploy** |
| ActionRow 5-button limit | Low | High | Split field groups into 2 rows (3+3) |

### G.8.1 Component Count Verification (MANDATORY)

**⚠️ CRITICAL: Verify component counts BEFORE deploying any UI changes!**

```javascript
// Add to ALL new UI handlers:
const { countComponents, validateComponentLimit } = await import('./utils.js');

// Option 1: Throw error if over limit
validateComponentLimit([container], "Item Stats UI");

// Option 2: Log count for debugging
countComponents([container], { verbosity: "summary", label: "Item Stats" });
// Output: "📊 Item Stats: 18 components (Container: 1, TextDisplay: 1, Separator: 2, ...)"
```

**Expected Component Counts for Phase 5:**
| UI Screen | Expected Count | Max Allowed |
|-----------|----------------|-------------|
| Item Edit (default) | ~15 | 40 |
| Item Edit (Stats selected) | ~18 | 40 |
| Add Attribute (select) | ~6 | 40 |
| Edit/Remove confirmation | ~7 | 40 |
| Player Menu Stats section | +3-5 per UI | Verify total stays under 40 |

### G.9 Future Extensions (Post-Phase 5)

1. **Consumable Attribute Items**: Potions that restore HP/Mana
2. **Equipment Slots**: Only one "weapon", one "armor" contributes bonuses
3. **Set Bonuses**: "Wearing 3 Dragon items gives +10 to all stats"
4. **Attribute Requirements**: "Requires 15 STR to equip"
5. **Multiplier Modifiers**: "1.5x Mana regeneration"

---

## Appendix H: Implementation Priority & Next Steps

### H.1 Recommended Order

Based on user feedback and system dependencies:

| Priority | Phase | Status | Notes |
|----------|-------|--------|-------|
| ✅ | Phase 0-1: Foundation | COMPLETE | Custom attributes exist |
| ✅ | Phase 2: Player Views | COMPLETE | Stats in Player Menu |
| ✅ | Phase 3: Admin Sets | COMPLETE | Stats button in Player Admin |
| ✅ | Phase 4: Custom Actions | COMPLETE | modify_attribute action |
| 🔜 | **Phase 5: Item Modifiers** | NEXT | This appendix |
| ⏸️ | Phase 6: Future Enemies | DEFERRED | After Phase 5 |

### H.2 Recommended First Implementation

**Start Simple**: Begin with Phase 5.1 (core infrastructure) and Phase 5.2 (basic UI). This proves the pattern works with minimal risk.

**Test Item**: Create a "Test Ring" with `+5 Mana` modifier to validate end-to-end.

### H.3 User Confirmation Needed

Before proceeding, please confirm:
1. ✅ Proceed with Phase 5.1 (core infrastructure)?
2. ❓ Include attribute requirements (Phase 5.4) now or defer?
3. ❓ Support only `add` operation or also `addMax`?
4. ❓ Show item bonuses inline in stats ("+5 from Ring") or just totals?

---

*Analysis completed: 2026-01-09*
*Updated with Appendices A-E: 2026-01-09*
*Updated with Appendix F (Implementation Notes): 2026-01-09*
*Updated with Phase 4 Implementation: 2026-01-09*
*Updated with Appendix G-H (Item Attribute Modifiers Plan): 2026-01-10*
*Author: Claude Opus 4.5 (assisted analysis)*
