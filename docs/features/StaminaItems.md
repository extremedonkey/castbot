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

## Related Documentation

- [Safari Points System](SafariPoints.md) - Core stamina mechanics
- [Safari Map Movement](SafariMapMovement.md) - Stamina consumption for movement
- [Entity Edit Framework](../architecture/EntityEditFramework.md) - Item editing system

---

*This feature enhances the Safari gameplay by adding strategic resource management through consumable stamina items, creating more dynamic exploration and planning opportunities.*