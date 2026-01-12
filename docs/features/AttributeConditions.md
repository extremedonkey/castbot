# Attribute Conditions

## Overview

Attribute Conditions allow Custom Actions to check player attributes (HP, Mana, Strength, etc.) before executing actions. This enables RPG-style gating like "requires 20 Mana to cast spell" or "only works when HP is below 50%".

**Prerequisites**:
- Attributes must be defined via Tools → Attributes (see [Attribute System](../../RaP/0964_20260109_AttributeSystem_Analysis.md))
- Custom Actions feature enabled

---

## Condition Types

CastBot supports three powerful attribute condition types:

| Type | Icon | Description | Use Case |
|------|------|-------------|----------|
| **Attribute Check** | 📊 | Check a single attribute against a value | "Mana ≥ 20" |
| **Compare Attributes** | ⚔️ | Compare two attributes against each other | "Strength > Dexterity" |
| **Multi-Attribute Check** | 📈 | Check multiple attributes at once | "All stats ≥ 10" |

---

## 1. Attribute Check (📊)

The basic condition type for checking a single attribute.

### Quick Start

```
Safari → Custom Actions → Edit action → Conditions tab → Add Condition
  → Select "📊 Attribute"
  → Select attribute (e.g., Mana)
  → Select target (Current/Max/Percent) [for resources]
  → Select operator (≥, ≤, =, >, <)
  → Set Value
  → Optionally enable "Item Bonuses"
```

### Example Use Cases

| Condition | Description |
|-----------|-------------|
| `Mana current ≥ 20` | Requires 20+ Mana to proceed |
| `HP percent < 50` | Only works when HP is below half |
| `Strength value ≥ 15` | Requires 15+ Strength stat |
| `Stamina max ≥ 3 (+items)` | Requires max stamina of 3+ including equipment bonuses |

### Configuration Options

| Option | Description |
|--------|-------------|
| **Attribute** | Which attribute to check |
| **Target** | For resources: Current, Maximum, or Percentage. Stats always use "value" |
| **Operator** | ≥, ≤, =, >, < |
| **Value** | Threshold to compare against |
| **Item Bonuses** | Include equipment bonuses in calculation |

### Data Structure

```json
{
  "type": "attribute_check",
  "config": {
    "attributeId": "mana",
    "comparison": "gte",
    "target": "current",
    "value": 20,
    "includeItemBonuses": false
  },
  "logic": "AND"
}
```

---

## 2. Compare Attributes (⚔️)

Compare two attributes against each other. Perfect for class-specific mechanics or stat requirements.

### Quick Start

```
Safari → Custom Actions → Edit action → Conditions tab → Add Condition
  → Select "⚔️ Compare Attributes"
  → Select left attribute (e.g., Strength)
  → Select left target (Current/Max/Percent) [if resource]
  → Select operator (≥, ≤, =, >, <)
  → Select right attribute (e.g., Dexterity)
  → Select right target [if resource]
  → Optionally enable "Item Bonuses"
```

### Example Use Cases

| Condition | Description |
|-----------|-------------|
| `Strength > Dexterity` | For warrior-specific actions |
| `HP current ≥ Mana current` | HP must be at least equal to current mana |
| `Stamina max ≥ HP max` | Maximum stamina must match max HP |
| `Intelligence > Strength (+items)` | Including equipment bonuses |

### Data Structure

```json
{
  "type": "attribute_compare",
  "config": {
    "leftAttributeId": "strength",
    "leftTarget": "current",
    "comparison": "gt",
    "rightAttributeId": "dexterity",
    "rightTarget": "current",
    "includeItemBonuses": false
  }
}
```

---

## 3. Multi-Attribute Check (📈)

Check multiple attributes at once with different aggregation modes.

### Quick Start

```
Safari → Custom Actions → Edit action → Conditions tab → Add Condition
  → Select "📈 Multi-Attribute"
  → Select mode (All/Any/Sum/Average)
  → Select attributes to check (or use shortcuts)
  → Select operator (≥, ≤, =, >, <)
  → Set threshold value
  → Optionally enable "Item Bonuses"
```

### Modes

| Mode | Description | Example |
|------|-------------|---------|
| **All** | Every selected attribute must pass | "All stats ≥ 10" |
| **Any** | At least one attribute must pass | "Any stat ≥ 20" |
| **Sum** | Sum of all attributes must pass | "Total stats ≥ 100" |
| **Average** | Average of all attributes must pass | "Avg stats ≥ 15" |

### Attribute Shortcuts

| Shortcut | Description |
|----------|-------------|
| `🎯 All Stats` | All stat-type attributes (Strength, Dexterity, etc.) |
| `⚡ All Resources` | All resource-type attributes (HP, Mana, Stamina) |
| `🌐 All Attributes` | Every defined attribute |

### Example Use Cases

| Condition | Description |
|-----------|-------------|
| `All(all_stats) ≥ 10` | Every stat must be at least 10 |
| `Sum(Str, Dex, Int) ≥ 50` | Combined stats must total 50+ |
| `Any(all_resources) < 20` | Trigger when any resource drops below 20% |
| `Average(all_stats) ≥ 15 (+items)` | Average stat including equipment |

### Data Structure

```json
{
  "type": "multi_attribute_check",
  "config": {
    "mode": "all",
    "attributes": ["strength", "dexterity", "intelligence"],
    "comparison": "gte",
    "value": 10,
    "includeItemBonuses": false
  }
}
```

---

## Item Modifier Awareness

All three condition types support the **Item Bonuses** toggle. When enabled:

- Non-consumable items with `attributeModifiers` are included in calculations
- Supports both `add` (current value) and `addMax` (maximum value) operations
- Useful for equipment-based requirements

### How It Works

1. System scans player's inventory for non-consumable items
2. Items with `attributeModifiers` array are processed
3. Modifiers matching the checked attribute are applied
4. Final value (base + item bonuses) is used for comparison

### Example: Equipment-Based Gating

A sword that gives +5 Strength allows a player with 10 base Strength to pass a "Strength ≥ 15" check when Item Bonuses is enabled.

---

## Attribute Change Triggers

*Event-driven attribute monitoring system*

Triggers fire automatically when attribute values cross thresholds. Unlike conditions (checked when a button is clicked), triggers monitor attributes passively.

### Trigger Events

| Event | Description | Use Case |
|-------|-------------|----------|
| `crosses_below` | Value drops below threshold | "Alert when HP < 25%" |
| `crosses_above` | Value rises above threshold | "Reward when Strength reaches 20" |
| `reaches_zero` | Value becomes exactly 0 | "Player defeated" |
| `reaches_max` | Value reaches maximum | "Fully healed" |
| `any_change` | Any modification to attribute | "Log all HP changes" |

### Threshold Types

| Type | Description |
|------|-------------|
| `absolute` | Fixed number (e.g., 25) |
| `percent` | Percentage of max (e.g., 25%) |

### How Triggers Work

1. `setEntityPoints()` is called (attribute changes)
2. System compares previous vs new values
3. Matching triggers fire their configured actions
4. Actions execute asynchronously (no Discord interaction required)

### Data Structure

```json
{
  "id": "trigger_1705156800000_abc123",
  "name": "Low HP Warning",
  "enabled": true,
  "config": {
    "attributeId": "hp",
    "event": "crosses_below",
    "threshold": 25,
    "thresholdType": "percent"
  },
  "actions": [
    {
      "type": "modify_attribute",
      "config": { "attributeId": "defense", "operation": "add", "amount": 5 }
    }
  ]
}
```

### Trigger Management Functions

| Function | Description |
|----------|-------------|
| `getAttributeTriggers(guildId)` | List all triggers |
| `getAttributeTrigger(guildId, triggerId)` | Get single trigger |
| `createAttributeTrigger(guildId, config)` | Create new trigger |
| `updateAttributeTrigger(guildId, triggerId, updates)` | Modify trigger |
| `deleteAttributeTrigger(guildId, triggerId)` | Remove trigger |
| `toggleAttributeTrigger(guildId, triggerId)` | Enable/disable |

### Important Notes

- Triggers fire asynchronously and don't block the action that caused the change
- Display text actions from triggers are logged but can't show to users (no interaction context)
- Maximum 20 triggers per guild
- Triggers are stored in `safariContent.json` under `attributeTriggers`

---

## Comparison Operators Reference

| Operator | Symbol | JavaScript | Description |
|----------|--------|------------|-------------|
| `gte` | ≥ | `>=` | Greater than or equal |
| `lte` | ≤ | `<=` | Less than or equal |
| `eq` | = | `===` | Exactly equal |
| `gt` | > | `>` | Strictly greater than |
| `lt` | < | `<` | Strictly less than |

---

## Button Handler Reference

### Attribute Check Handlers
| Handler | Purpose |
|---------|---------|
| `condition_attr_select_*` | Select attribute |
| `condition_attr_target_*` | Select target (current/max/percent) |
| `condition_attr_comp_*` | Select comparison operator |
| `condition_attr_value_*` | Open value input modal |
| `condition_attr_itembonuses_*` | Toggle item bonus inclusion |

### Compare Attributes Handlers
| Handler | Purpose |
|---------|---------|
| `condition_attrcomp_left_*` | Select left attribute |
| `condition_attrcomp_lefttarget_*` | Select left target |
| `condition_attrcomp_comp_*` | Select comparison operator |
| `condition_attrcomp_right_*` | Select right attribute |
| `condition_attrcomp_righttarget_*` | Select right target |
| `condition_attrcomp_itembonuses_*` | Toggle item bonus inclusion |

### Multi-Attribute Check Handlers
| Handler | Purpose |
|---------|---------|
| `condition_multiattr_mode_*` | Select mode (all/any/sum/average) |
| `condition_multiattr_attrs_*` | Select attributes (multi-select) |
| `condition_multiattr_comp_*` | Select comparison operator |
| `condition_multiattr_value_*` | Open value input modal |
| `condition_multiattr_itembonuses_*` | Toggle item bonus inclusion |

---

## Troubleshooting

### "No attributes defined!"

**Cause**: Server has no attributes configured.
**Fix**: Go to Tools → Attributes and create/enable attributes first.

### "Need at least 2 attributes!"

**Cause**: Compare Attributes requires two different attributes to compare.
**Fix**: Create more attributes in Tools → Attributes.

### Condition not evaluating correctly

1. Check attribute exists in server's `attributeDefinitions`
2. Verify player has been initialized with the attribute
3. Check comparison operator is correct (≥ vs >)
4. For percentages, ensure value is 0-100, not 0-1
5. If using Item Bonuses, verify items have `attributeModifiers` configured

### Triggers not firing

1. Check trigger is `enabled: true`
2. Verify the `event` type matches the expected behavior
3. Ensure `thresholdType` matches your threshold value
4. Check logs for "🎯 Attribute trigger fired" messages

---

## Related Documentation

- [Attribute System Analysis](../../RaP/0964_20260109_AttributeSystem_Analysis.md) - Full attribute system design
- [Safari Custom Actions](./SafariCustomActions.md) - Custom Actions framework
- [Safari Points](./SafariPoints.md) - Points/stamina system
- [Advanced Attribute Conditions Analysis](../../RaP/0960_20260113_AttributeConditions_Analysis.md) - Design document

---

*Initial Implementation: 2026-01-13*
*Advanced Features: 2026-01-13*
*Author: Claude Opus 4.5*
