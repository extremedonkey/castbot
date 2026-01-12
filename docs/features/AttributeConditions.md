# Attribute Conditions

## Overview

Attribute Conditions allow Custom Actions to check player attributes (HP, Mana, Strength, etc.) before executing actions. This enables RPG-style gating like "requires 20 Mana to cast spell" or "only works when HP is below 50%".

**Prerequisites**:
- Attributes must be defined via Tools → Attributes (see [Attribute System](../../RaP/0964_20260109_AttributeSystem_Analysis.md))
- Custom Actions feature enabled

---

## Quick Start

### Admin Configuration Path

```
Safari → Custom Actions → Edit action → Conditions tab → Add Condition
  → Select "📊 Attribute"
  → Select attribute (e.g., Mana)
  → Select target (Current/Max/Percent) [for resources]
  → Select operator (≥, ≤, =, >, <)
  → Set Value
```

### Example Use Cases

| Condition | Description |
|-----------|-------------|
| `Mana current ≥ 20` | Requires 20+ Mana to proceed |
| `HP percent < 50` | Only works when HP is below half |
| `Strength value ≥ 15` | Requires 15+ Strength stat |
| `Stamina max ≥ 3` | Requires maximum stamina capacity of 3+ |

---

## Condition Configuration

### Attribute Types

| Category | Description | Targets Available |
|----------|-------------|-------------------|
| **Resource** | Has current/max values, regenerates (HP, Mana, Stamina) | Current, Maximum, Percentage |
| **Stat** | Single value, no regeneration (Strength, Dexterity) | Value only |

### Comparison Operators

| Operator | Symbol | Description |
|----------|--------|-------------|
| `gte` | ≥ | Greater than or equal |
| `lte` | ≤ | Less than or equal |
| `eq` | = | Exactly equal |
| `gt` | > | Greater than |
| `lt` | < | Less than |

### Targets (Resource Attributes Only)

| Target | Description | Example |
|--------|-------------|---------|
| `current` | Current value | "Mana is 30" |
| `max` | Maximum capacity | "Max Mana is 50" |
| `percent` | Current as % of max | "Mana is at 60%" |

For **stat attributes**, the target is always `value` (auto-selected).

---

## Data Structure

### Condition Format

```json
{
  "type": "attribute_check",
  "config": {
    "attributeId": "mana",
    "comparison": "gte",
    "target": "current",
    "value": 20
  },
  "logic": "AND"
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Always `"attribute_check"` |
| `config.attributeId` | string | ID of the attribute (e.g., `"mana"`, `"hp"`, `"strength"`) |
| `config.comparison` | string | Comparison operator: `"gte"`, `"lte"`, `"eq"`, `"gt"`, `"lt"` |
| `config.target` | string | What to compare: `"current"`, `"max"`, `"percent"`, `"value"` |
| `config.value` | number | Threshold value to compare against |
| `logic` | string | How to combine with next condition: `"AND"` or `"OR"` |

---

## UI Flow

### Step 1: Select Condition Type

```
┌─────────────────────────────────────────────────────────────────┐
│  ➕ Condition Editor                                            │
│  When...                                                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ▼ Select Condition Type...                                 ││
│  │  🪙 Currency                                                ││
│  │  📦 Item                                                    ││
│  │  👑 Role                                                    ││
│  │  📊 Attribute              ← Select this                    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Step 2: Configure Attribute Condition

```
┌─────────────────────────────────────────────────────────────────┐
│  ### 📊 Attribute Check                                        │
│  When player's attribute...                                    │
├─────────────────────────────────────────────────────────────────┤
│  [▼ Select Attribute: 🔮 Mana (Resource)]                      │
│                                                                 │
│  **Compare:**                                                   │
│  [📉 Current] [📈 Maximum] [💯 Percentage]                      │
│                                                                 │
│  **Operator:**                                                  │
│  [≥] [≤] [=] [>] [<]                                           │
│                                                                 │
│  **Current:** 🔮 Mana current ≥ **20**                         │
│                                                                 │
│  [🔢 Set Value]                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Integration with Actions

### Execute Based on Condition Results

Actions have an `executeOn` field that determines when they run:

| Value | Behavior |
|-------|----------|
| `"true"` | Execute when conditions **pass** |
| `"false"` | Execute when conditions **fail** |

### Example: Mana Cost Spell

```json
{
  "conditions": [
    {
      "type": "attribute_check",
      "config": {
        "attributeId": "mana",
        "comparison": "gte",
        "target": "current",
        "value": 20
      }
    }
  ],
  "actions": [
    {
      "type": "modify_attribute",
      "executeOn": "true",
      "config": {
        "attributeId": "mana",
        "operation": "subtract",
        "amount": 20
      }
    },
    {
      "type": "display_text",
      "executeOn": "true",
      "config": { "message": "You cast the spell!" }
    },
    {
      "type": "display_text",
      "executeOn": "false",
      "config": { "message": "Not enough mana!" }
    }
  ]
}
```

---

## Combining Conditions

Multiple conditions can be combined using `AND`/`OR` logic:

```json
{
  "conditions": [
    {
      "type": "attribute_check",
      "config": { "attributeId": "mana", "comparison": "gte", "target": "current", "value": 20 },
      "logic": "AND"
    },
    {
      "type": "attribute_check",
      "config": { "attributeId": "strength", "comparison": "gte", "target": "value", "value": 15 }
    }
  ]
}
```

**Evaluation**: First condition sets accumulator, subsequent conditions apply the **previous** condition's `logic` operator.

---

## Backend Implementation

### Condition Evaluation

Located in `safariManager.js` → `evaluateSingleCondition()`:

```javascript
case 'attribute_check': {
    const { attributeId, comparison, target, value } = condition.config;

    // Get attribute definition for category
    const attrDef = attrDefs[attributeId];

    // Get player's attribute value
    const points = await getEntityPoints(guildId, `player_${userId}`, attributeId);

    // Determine compare value based on target
    let compareValue;
    if (attrDef.category === 'resource') {
        switch (target) {
            case 'current': compareValue = points.current; break;
            case 'max': compareValue = points.max; break;
            case 'percent': compareValue = (points.current / points.max) * 100; break;
        }
    } else {
        compareValue = points.current; // Stat value
    }

    // Apply comparison
    switch (comparison) {
        case 'gte': return compareValue >= value;
        case 'lte': return compareValue <= value;
        // ... etc
    }
}
```

### Button Handler Patterns

| Handler | Purpose |
|---------|---------|
| `condition_attr_select_*` | Select attribute from dropdown |
| `condition_attr_target_*` | Select target (current/max/percent) |
| `condition_attr_comp_*` | Select comparison operator |
| `condition_attr_value_*` | Open value input modal |
| `modal_condition_attr_value_*` | Save value from modal |

---

## Troubleshooting

### "No attributes defined!"

**Cause**: Server has no attributes configured.
**Fix**: Go to Tools → Attributes and create/enable attributes first.

### Condition not evaluating correctly

1. Check attribute exists in server's `attributeDefinitions`
2. Verify player has been initialized with the attribute
3. Check comparison operator is correct (≥ vs >)
4. For percentages, ensure value is 0-100, not 0-1

### Stat attribute shows target selector

**Expected behavior**: Stat attributes auto-select `value` target. The target selector (Current/Max/Percent) only shows for **resource** category attributes.

---

## Related Documentation

- [Attribute System Analysis](../../RaP/0964_20260109_AttributeSystem_Analysis.md) - Full attribute system design
- [Safari Custom Actions](./SafariCustomActions.md) - Custom Actions framework
- [Safari Points](./SafariPoints.md) - Points/stamina system

---

## Future Enhancements

Planned features (see RaP/0960):

| Feature | Description |
|---------|-------------|
| **Comparative Conditions** | Compare attributes: "Strength > Dexterity" |
| **Multi-Attribute Checks** | Aggregate: "All stats >= 10" |
| **Item Modifier Awareness** | Check total including equipment bonuses |
| **Attribute Change Triggers** | Event-based: "When HP drops below 25%" |

---

*Implemented: 2026-01-13*
*Author: Claude Opus 4.5*
