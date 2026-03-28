# Enemy System

## Overview

Enemies are a Safari entity type — "items that fight back." Admins create enemy entities with HP and Attack, then deploy them as outcomes in custom actions. When a player triggers the action, combat resolves synchronously (all turns calculated at once), and the result (win/lose) determines which pass/fail outcomes run.

**Entry Point:** Tools > Enemies (🐙)
**Outcome Type:** `fight_enemy` in the Action Editor

## How It Works

```
Admin creates enemy (name, emoji, HP, attack, turn order)
Admin creates action with fight_enemy Opening Outcome
Admin adds Pass outcomes (rewards) and Fail outcomes (penalties)
Player triggers action → combat resolves → win/lose drives pass/fail
```

### Prerequisites for Players

- **HP attribute** must be enabled on the server (Tools > Attributes > enable HP)
- Player must have **HP > 0** to start a fight
- Player must have an **item with attackValue** in their inventory (their weapon)

## Enemy Entity

Stored at `safariContent[guildId].enemies[enemyId]`.

```javascript
{
  id: 'enemy_octorok_123456',
  name: 'Octorok',
  emoji: '🐙',
  description: 'A pesky rock-spitting octopus',
  category: 'common',
  hp: 4,                          // max HP per encounter (always starts at max)
  attackValue: 2,                 // damage dealt to player per turn
  turnOrder: 'player_first',     // 'player_first' | 'enemy_first' | 'simultaneous'
  image: 'https://...',          // optional image URL
  metadata: { createdBy, createdAt, lastModified }
}
```

### Entity Edit Framework

Managed via the same Entity Edit Framework as Items/Stores. Field groups:

| Group | Fields |
|-------|--------|
| Enemy Info | name, emoji, description, category |
| Combat | hp, attackValue |
| Appearance | image URL |

**Turn order** is configured via a String Select on the entity detail view (not in a modal).

### Turn Order Options

| Value | Behavior |
|-------|----------|
| `player_first` | Player attacks, then enemy (if alive). **Default.** |
| `enemy_first` | Enemy attacks, then player (if alive). |
| `simultaneous` | Both attack regardless. Double KO possible. |

## Combat Resolution

Synchronous, deterministic, turn-by-turn. All turns calculated at once and displayed as a narrative.

### Algorithm

1. Player's attack = highest `attackValue` item in inventory
2. Enemy always starts at max HP
3. Each turn: attacker deals their attack value as damage to defender
4. Second attacker only attacks if still alive (except `simultaneous`)
5. Combat ends when either HP reaches 0
6. 50-turn safety cap — player loses if reached

### Player Attack Source

Player attack comes from their **best item with attackValue** in inventory:
- Scans all inventory items, picks highest `attackValue` where quantity > 0
- If the weapon is consumable (`consumable === 'Yes'`), 1 is consumed after the fight (win or lose)
- No attack items = can't fight (clear error message shown)

### Player HP

Player HP uses the **attribute system** (`getEntityPoints` / `setEntityPoints` with pointType `'hp'`). After combat, player HP is updated to reflect damage taken.

## Action Integration

### Outcome Type: `fight_enemy`

Added to the Action Editor as an outcome type. Config:

```javascript
{
  type: 'fight_enemy',
  executeOn: 'always',          // typically Opening
  config: {
    enemyId: 'enemy_octorok_123456',
    limit: { type: 'unlimited' }  // or 'once_per_player', 'once_globally'
  }
}
```

### Two-Phase Execution

The `fight_enemy` outcome modifies how `executeButtonActions()` determines pass/fail:

1. **Conditions evaluate** (pre-checks like "player HP > 0")
2. **Opening outcomes execute** (including `fight_enemy`)
3. **Fight result overrides conditionsResult** for pass/fail branching
4. **Pass or Fail outcomes run** based on fight result

This is 100% backwards-compatible — actions without `fight_enemy` behave identically (fightResult stays null, conditions drive pass/fail as before).

### Usage Limits

Configured per-outcome in the fight_enemy config UI:
- **Unlimited** — fight repeatedly
- **Once per player** — each player fights once (tracked via `claimedBy[]`)
- **Once globally** — first player claims it

### Typical Action Setup

```
Action: "Fight the Octorok"
├── Condition: attribute_check (HP > 0)
├── Opening: fight_enemy (Octorok)
├── Pass: give_item (Deku Stick x1)
├── Pass: update_currency (+50 rupees)
├── Pass: display_text ("You found a Deku Stick!")
└── Fail: display_text ("The Octorok was too strong...")
```

## Combat Display

Components V2 container with:
- Header: enemy emoji + name + "battle!"
- Description (small text)
- Turn-by-turn narrative (truncated to first 2 + last 2 if >8 turns)
- Victory/Defeat banner
- Stats summary (turns, remaining HP)
- Green accent (0x57F287) for victory, red (0xED4245) for defeat

## Files

| File | Role |
|------|------|
| `config/safariLimits.js` | `EDIT_TYPES.ENEMY`, `MAX_ENEMIES_PER_GUILD` |
| `editFramework.js` | `EDIT_CONFIGS` for enemy entity |
| `entityManager.js` | CRUD operations, cleanup references |
| `entityManagementUI.js` | List/detail views, turn order select |
| `fieldEditors.js` | Modal builders for info/combat/appearance |
| `safariManager.js` | `resolveCombat()`, `getPlayerAttackValue()`, `buildCombatDisplay()`, `executeFightEnemy()`, two-phase execution in `executeButtonActions()` |
| `customActionUI.js` | Outcome type option, summaries, `showFightEnemyConfig()` |
| `app.js` | `safari_manage_enemies` handler, turn order handler, outcome config handlers |
| `menuBuilder.js` | Enemies button in Tools menu |
| `tests/enemyCombat.test.js` | 17 unit tests for combat logic |

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Enemy stats | Simple properties (hp, attackValue) | Ephemeral per encounter, no regen needed. Forward-compatible with attributes. |
| Player attack | From items (best attackValue) | Creates weapon acquisition gameplay. Consistent with existing PvP. |
| Turn order | On enemy entity | Per-enemy flavor. Future: outcome override, speed attribute. |
| Combat model | Synchronous | Simple, one interaction. Future: interactive turns. |
| Fight result wiring | Two-phase execution | Backwards-compatible. Conditions = pre-checks, fight = gameplay. |
| Defense | Skipped for MVP | Make enemies harder = buff HP/attack. Add defense later. |
| Naming | `attackValue` not `attack` | Consistent with item field naming. |

## Future Enhancements

- Interactive combat (Attack/Defend/Flee/Use Item buttons per turn)
- Defense stat on enemies and players
- Speed/Dexterity-based turn order
- Enemy attribute integration (persistent HP for world bosses)
- Multiple enemies per encounter
- Enemy preview before fight
- `once_per_period` usage limits
- Combat log channel for spectators

---

Related: [Attributes](Attributes.md) | [Safari Custom Actions](SafariCustomActions.md) | [RaP 0931](../01-RaP/0931_20260328_EnemySystem_Analysis.md)
