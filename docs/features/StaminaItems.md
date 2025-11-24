# Stamina Items Feature

## Overview

The Stamina Items feature allows items in the Safari system to provide stamina boosts when consumed by players. This enables strategic gameplay where players can use consumable items to gain extra stamina points, potentially exceeding their normal maximum stamina for enhanced map exploration.

## Implementation Date
- **Branch:** `staminaItems`
- **Created:** August 14, 2025
- **Status:** In Development

## Key Features

### 1. Item Configuration
Items can now have two new properties:
- **`staminaBoost`**: Number of stamina points granted when consumed (0-10)
- **`consumable`**: Whether the item is consumed on use ("Yes" or "No")

### 2. Over-Max Stamina
- Players can exceed their maximum stamina through consumable items
- Stamina above max does not regenerate (only regenerates when below max)
- Example: Player with 1/1 stamina uses +2 stamina item → becomes 3/1 stamina

### 3. Consumption UI
- Consumable items with stamina boost show a green "Use" button in inventory
- Button displays the stamina boost amount: `Use (+2 ⚡)`
- Items are automatically removed from inventory when consumed

## Technical Implementation

### Files Modified

#### 1. `editFramework.js`
Added stamina fields to item properties:
```javascript
staminaBoost: { 
  type: 'number', 
  min: 0, 
  max: 10, 
  required: false, 
  label: 'Stamina Boost',
  placeholder: '0'
},
consumable: {
  type: 'select',
  options: ['No', 'Yes'],
  required: false,
  label: 'Consumable Item',
  default: 'No'
}
```

#### 2. `safariManager.js`
- Added `staminaBoost` field to item creation (line 1652)
- Added stamina boost display in item content (lines 149-157)
- Added "Use" button for consumable stamina items in inventory (lines 2925-2947)

#### 3. `pointsManager.js`
- Modified `setEntityPoints` to support `allowOverMax` parameter (line 179)
- Added new `addBonusPoints` function for adding stamina that can exceed max (lines 207-229)

#### 4. `app.js`
- Added `safari_use_item_` button handler (lines 8210-8283)
- Handles item consumption and stamina application

## Usage Guide

### Creating a Stamina Item

1. Navigate to Safari Admin → Manage Entities → Items
2. Create or edit an item
3. Set the following fields:
   - **Stamina Boost**: Number of stamina points (e.g., 2)
   - **Consumable Item**: Set to "Yes"
   - **Base Price**: Set appropriate cost

### Example Items

**Energy Potion**
- Name: "Energy Potion"
- Emoji: "🧪"
- Description: "Restores 2 stamina points"
- Stamina Boost: 2
- Consumable: Yes
- Base Price: 50

**Super Stamina Elixir**
- Name: "Super Stamina Elixir"
- Emoji: "⚡"
- Description: "Grants 5 bonus stamina points!"
- Stamina Boost: 5
- Consumable: Yes
- Base Price: 200

### Player Experience

1. Player purchases stamina item from store
2. Item appears in inventory with "Use (+X ⚡)" button
3. Player clicks Use button
4. Stamina is immediately increased
5. Item quantity decreases by 1 (or removed if last one)
6. Confirmation message shows stamina change

## Stamina Mechanics

### Regeneration Behavior
- **Below Max**: Stamina regenerates normally after cooldown period
- **At Max**: No regeneration needed
- **Above Max**: No regeneration occurs - stamina stays at bonus level until used

### Example Scenarios

**Scenario 1: Basic Use**
- Player has 0/1 stamina
- Uses Energy Potion (+2 stamina)
- Result: 2/1 stamina
- Can now move twice before needing to rest

**Scenario 2: Stacking**
- Player has 1/1 stamina
- Uses Energy Potion (+2 stamina) → 3/1 stamina
- Uses another Energy Potion (+2 stamina) → 5/1 stamina
- Can make 5 moves before running out

**Scenario 3: Regeneration**
- Player has 2/1 stamina (over max)
- Uses 2 stamina for movement → 0/1 stamina
- After 3 minutes (or configured time), regenerates to 1/1
- Does NOT regenerate back to 2/1

## Configuration

### Global Stamina Settings
Stamina defaults are configured in `pointsManager.js`:
```javascript
defaultMax: parseInt(process.env.STAMINA_MAX || '1'),
interval: (parseInt(process.env.STAMINA_REGEN_MINUTES || '3')) * 60000,
```

### Item Limits
- Maximum stamina boost per item: 10
- Items can be stacked (use multiple for cumulative effect)
- No hard cap on total stamina (theoretical limit based on inventory)

## Best Practices

### Game Balance
1. **Price appropriately**: Higher stamina boosts should cost more
2. **Limit availability**: Consider making high-boost items rare
3. **Strategic placement**: Place stamina items in stores near challenging map areas

### Item Design
1. **Clear descriptions**: Explain the stamina boost in item description
2. **Visual indicators**: Use energy-related emojis (⚡, 🔋, ⚡, 🧪)
3. **Graduated tiers**: Offer items with different boost levels

## Future Enhancements

### Potential Features
1. **Cooldowns**: Prevent rapid consumption of multiple items
2. **Buff Duration**: Temporary stamina boosts that expire
3. **Stamina Debuffs**: Items or effects that reduce max stamina
4. **Conditional Boosts**: Extra stamina in certain map areas
5. **Trade-offs**: Items that boost stamina but reduce other stats

### Integration Opportunities
- **Map Events**: Stamina fountains or rest areas
- **Combat System**: Stamina cost for attacks
- **Quests**: Stamina requirements for special actions
- **Achievements**: Rewards for efficient stamina use

## Testing Checklist

### Consumable Items
- [ ] Create item with stamina boost via entity editor
- [ ] Verify stamina boost appears in item display
- [ ] Purchase item from store
- [ ] Verify "Use" button appears in inventory
- [ ] Use item and verify stamina increases
- [ ] Verify item is consumed (quantity decreases)
- [ ] Test over-max stamina (e.g., 3/1)
- [ ] Verify regeneration only occurs when below max
- [ ] Test with multiple stamina items
- [ ] Verify error handling for invalid items

### Permanent Items (As-Built: November 2024)
- [ ] Create non-consumable item with stamina boost
- [ ] Verify NO "Use" button appears (stays in inventory)
- [ ] Test charge regeneration after cooldown
- [ ] Verify each charge regenerates independently
- [ ] Test with multiple permanent items stacking

---

## 🐎 Permanent Stamina Items (AS-BUILT: November 2024)

### Overview
Permanent stamina items (like horses) provide lasting stamina capacity increases that are not consumed on use. Players can build a collection of permanent equipment to increase their exploration capabilities.

### Implementation Status: ✅ LIVE IN PRODUCTION
- **Merged from**: RaP 0965_20251124_PermanentStaminaItems_Analysis.md
- **Implementation Date**: November 24, 2024
- **Status**: Fully implemented with Phase 2 (individual charge tracking)

### How Permanent Items Work

#### Item Configuration
```json
{
  "horse_511965": {
    "name": "Horse",
    "emoji": "🐎",
    "description": "Grants +1 permanent stamina capacity",
    "staminaBoost": 1,
    "consumable": "No",  // KEY: Not consumable
    "basePrice": 100
  }
}
```

#### Player Experience

**Without permanent items**: Standard regeneration
- 1 stamina regenerates after 720 minutes (12 hours)

**With Horse (+1)**: Enhanced capacity
- 2 total stamina (1 base + 1 from horse)
- Each stamina charge regenerates independently
- Use 1 stamina → only that charge enters 12-hour cooldown
- Other charge remains available

**With Super Horse (+3)**: Major progression
- 4 total stamina (1 base + 3 from super horse)
- Each of 4 charges has independent cooldown
- Strategic value: Can use stamina throughout the day

### The Super Horse Example

Illustrating why individual charge tracking matters:

```
Player has Super Horse (+3) = 4 total stamina

Hour 0:   4/4 stamina (all charges ready)
Hour 1:   Uses 1 → 3/4 (only charge #1 on cooldown)
Hour 6:   Uses 1 → 2/4 (only charge #2 on cooldown)
Hour 13:  Charge #1 regenerates → 3/4 ✨
Hour 18:  Charge #2 regenerates → 4/4 ✨

Total stamina over 24 hours: 7+ moves (vs 4 with old system)
```

### Technical Implementation

#### Phase 2: Individual Charge System (IMPLEMENTED)
```javascript
// Data structure with charges array
"stamina": {
  "current": 2,
  "max": 2,
  "charges": [null, null]  // null = available, timestamp = on cooldown
}
```

#### Key Functions (pointsManager.js)
- `calculatePermanentStaminaBoost()`: Sums all non-consumable stamina items
- `calculateRegenerationWithCharges()`: Handles individual charge regeneration
- `usePoints()`: Marks specific charges as used with timestamps

### Backward Compatibility
- Players WITHOUT permanent items use unchanged legacy code
- Charges array only created when permanent items detected
- Zero regression risk for existing players

### Configuration Considerations

#### Stacking
- Multiple permanent items stack additively
- Horse (+1) + Boots (+1) = +2 total boost

#### Categories (Future Enhancement)
- Could limit to one "mount" type item
- Equipment items could stack separately

#### Progression Examples
- **Basic**: Horse (+1) - Early game
- **Advanced**: Fast Horse (+2) - Mid game
- **Elite**: Pegasus (+3) - End game

### Testing Verification
```bash
# Look for these log entries:
🐎 Found permanent stamina item: Horse (+1)
🐎 Total permanent stamina boost for player_X: +1
🐎 Initializing charge system with 2 total charges
🐎⚡ Charge 1 regenerated for player_X
🐎⚡ Charge 2 regenerated for player_X
```

### Production Deployment
- **Soft launched**: November 24, 2024
- **Safe deployment**: Players without items unaffected
- **Full release**: After 48-hour testing period

## Related Documentation

- [Safari Points System](SafariPoints.md) - Core stamina mechanics
- [Safari Map Movement](SafariMapMovement.md) - Stamina consumption for movement
- [Entity Edit Framework](../architecture/EntityEditFramework.md) - Item editing system

---

*This feature enhances the Safari gameplay by adding strategic resource management through consumable stamina items, creating more dynamic exploration and planning opportunities.*