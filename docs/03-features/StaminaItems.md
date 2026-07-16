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

### Consumable Items Do NOT Reset Regen Timer

**Critical design decision** (February 2026): Using a consumable stamina item does **not** restart the regeneration cooldown. This means:

- Consumable items are purely additive — they give bonus stamina without any penalty
- The regen timer continues counting from its existing anchor

**Why this matters with long cooldowns (e.g. 24 hours):**
If a player's regen is 5 minutes away and they use a consumable, they still get their natural regen in 5 minutes. Without this design, using a consumable would restart the 24-hour timer — severely punishing the player.

**Implementation details** (`pointsManager.js`):
- `addBonusPoints()` modifies `current` only — does not touch `lastUse` or `lastRegeneration`
- `usePoints()` **always** stamps `lastUse = now` on any spend — every move restarts the countdown (whether the point was natural or consumable-granted)
- The regen engine and timer display share one anchor: `latestRegenAnchor = max(lastUse, lastRegeneration)` — the later of last spend and last applied regen

### One Regeneration System

There is a **single anchor-based regen timer per player** — no per-item or per-point timers (the old "Phase 2" per-charge system was removed 2026-07-16):

- Regen check: `Date.now() - latestRegenAnchor >= interval` AND `current < max`
- **Full-reset mode** (regen amount blank): stamina refills to `effectiveMax` after one interval, clamped
- **Drip mode** (regen amount = N): `+N` per elapsed period (may overshoot max)
- Permanent items only make the tank **bigger** (`effectiveMax`) — the extra capacity refills under the same timer as everything else

### Example Scenarios

**Scenario 1: Basic Use**
- Player has 0/1 stamina
- Uses Energy Potion (+2 stamina)
- Result: 2/1 stamina
- Can now move twice before needing to rest
- Regen timer **unchanged** — continues counting from last move

**Scenario 2: Stacking**
- Player has 1/1 stamina
- Uses Energy Potion (+2 stamina) → 3/1 stamina
- Uses another Energy Potion (+2 stamina) → 5/1 stamina
- Can make 5 moves before running out

**Scenario 3: Regeneration**
- Player has 2/1 stamina (over max)
- Uses 2 stamina for movement → 0/1 stamina
- After configured time, regenerates to 1/1
- Does NOT regenerate back to 2/1

**Scenario 4: Consumable + Permanent Item**
- Player holds a Horse (+3 max) → 2/4 stamina, regen due in 5 min
- Eats a Fish (consumable +1) → 3/4 stamina, regen timer **still shows 5 min** (unaffected)
- 5 min later (full-reset mode): stamina refills to 4/4

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

### Permanent Items (As-Built: "Bigger Tank", 2026-07-16)
- [ ] Create non-consumable item with stamina boost
- [ ] Verify NO "Use" button appears (stays in inventory)
- [ ] Verify max rises while the item is held (e.g. 3/3 → 3/5 with +2)
- [ ] Verify removing the item drops max back (current clamps if over)
- [ ] Verify the extra capacity refills under the server's normal regen mode
- [ ] Test with multiple permanent items stacking

---

## 🐎 Permanent Stamina Items (AS-BUILT: "Bigger Tank", 2026-07-16)

### Overview
Permanent stamina items (like horses) provide lasting stamina capacity increases that are not consumed on use. Players can build a collection of permanent equipment to increase their exploration capabilities.

### Implementation Status: ✅ LIVE IN PRODUCTION
- **Originally designed in**: RaP 0965_20251124_PermanentStaminaItems_Analysis.md (Phase-2 per-charge system, November 2025)
- **Reworked**: 2026-07-16 — the per-charge system was **removed**; permanent items are now **+max only** ("Bigger Tank")

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

#### The Model: +max Only

While the item is held, the player's effective max rises:

```
effectiveMax = min(config.defaultMax + permanentBoost, MAX_STAMINA = 999)
```

- **Max rises while held**: base 1 + Horse (+1) → `⚡ 1/2` on the next read
- **Stacks additively** across items: Horse (+1) + Boots (+1) = +2 total
- **Removal drops max**: lose the item and max snaps back on the next read (current clamps if over)
- **Refills under the normal regen mode**: the extra capacity uses the server's single regen timer (full reset or drip) — no per-charge timers, no separate engine
- **Numeric coercion**: `staminaBoost` is coerced at read (`Number(item.staminaBoost) || 0` in `calculatePermanentStaminaBoost`) and at write (`entityManager.updateEntityFields` coerces schema `type: 'number'` fields), fixing the historical string-concat corruption

#### Player Experience

**Without permanent items**: base capacity
- e.g. 1 stamina, refills 12 hours after your last move

**With Horse (+1)**: bigger tank
- 2 total stamina (1 base + 1 from horse)
- Spend both, wait one cooldown → refill to 2/2 (full-reset mode)

**With Super Horse (+3)**: major progression
- 4 total stamina (1 base + 3 from super horse)
- Four moves per cooldown cycle instead of one

### Key Functions (pointsManager.js)
- `calculatePermanentStaminaBoost()`: sums all non-consumable stamina items (numerically coerced)
- `calculateRegenerationWithCharges()`: single anchor-based regen; caps `effectiveMax` at `MAX_STAMINA`; strips legacy charge arrays (the name is historical)
- `usePoints()`: deducts and always stamps `lastUse = now`

### Legacy Migration (charges[])
Records created under the old Phase-2 system may still carry a `charges` array. It is migrated away **lazily and one-way**: any regen read or admin set deletes the array, clamps `current` to `effectiveMax`, and snaps `max` to the numeric `effectiveMax`. Look for:
```
🧹 Removed legacy charge array for player_X: now 2/4
```

### Configuration Considerations

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
🐎⚡ Includes +1 permanent boost to max
🧹 Removed legacy charge array for player_X: now 1/2   # legacy records only
```

## Related Documentation

- [Stamina Architecture](StaminaArchitecture.md) - Authoritative stamina reference (regen anchor, Bigger Tank, over-max rules)
- [Safari Points System](Attributes.md) - Core stamina mechanics
- [Safari Map Movement](SafariMapMovement.md) - Stamina consumption for movement
- [Entity Edit Framework](../architecture/EntityEditFramework.md) - Item editing system

---

*This feature enhances the Safari gameplay by adding strategic resource management through consumable stamina items, creating more dynamic exploration and planning opportunities.*