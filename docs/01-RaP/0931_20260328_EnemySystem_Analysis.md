# 0931 - Enemy System (Entity + Action Outcome)

**Date:** 2026-03-28
**Status:** Implemented → [docs/03-features/EnemySystem.md](../03-features/EnemySystem.md)
**Affects:** Entity Edit Framework, Action System (Outcomes), Attribute System, Items, safariManager.js, customActionUI.js, app.js
**Supersedes:** `docs/archive/SafariEnemySystem-Superseded.md` (PvE combat system with AI state machines — completely different vision)

---

## Original Context (Trigger Prompt)

> So I'm basically thinking enemies are a new Entity type that can be 'deployed' in various ways, most importantly as an Opening Outcome in a custom action. The implementation in castbot I'm thinking is based around an earlier carlbot scripted / high manual labor version, here's an example:
>
> Zeldavivor
> :DekuBaba: Withered Deku Baba battle!
> You are fighting a withered Deku Baba. This is a fairly weak carnivorous plant that you don't want to get near!## Attack 1⠀
> Both :linkicon: Reece and :DekuBaba: Withered Deku Baba leap toward each other, knocking each other out at the exact same time! It's a double knock-out!
> ⠀
> ⠀
> :rupee:Wallet Balance
> 225 (+0)
> 💥Total Damage
> 0 (+-1)
> :fh:New HP
> 0 / 0
> <:DekuBaba:1211188275130404864> **Withered Deku Baba** battle!
>
> MVP is:
> Simple turn by turn
> Uses Entity Framework (similar pattern to items - they're almost like items that can fight back; leverages entity search for >= 25 enemies in string selects)
> Enemies are fully self contained and typically deployed to a location via an Opening Outcome (e.g., Outcome 'fight enemy' -> Select Enemy from String Select -> Configure some possible basic things like offering the player the ability to preview enemy attack / defense / etc or straight into the fight)
> Enemy has by default HP and Attack..
> HP => Leverage Attributes
> Attack => This one is tricky as we have a prototype attack system built early on for the 'tycoons' system, now provides a basic Player PvP that can be used; can be assigned to items which can be used to attack players (primarily once off). But to me this 'feels' like it should belong to the attribute system;
> Actually just checked and Attack isn't a custom attribute; and seems like there's no way for a player to have an attack value without holding an item which has an attack value which might be okay; considerations for consumably attack items if we go down this path
> Item Drops -> Completely decoupled from the enemy itself, simply configured as an Outcome
> Action Condition => Guess we need some way to link in the 'enemy defeat' to this system in Action Editor
> Turn order: Literally thinking it's like => simple configurable turn order somewhere (in the enemy config itself? in the action editor outcome type of 'enemy?' defaults to the player? a global setting). Probably best to tie it to enemy configuration.
> Enemy UI: I very much like the UI / UX of items, this would be a new dedicated button somewhere, e.g. safari_manage_items ; entity_select_item ; deku_shield_823718 => hopefully most of this comes from the entity edit framework and we don't have to reinvent the wheel
> Enemies can have their own Emoji as per players
> How to align Attribute System with the Enemy UI?
>
> \# Example Turn order
> \## Starting conditions; pre-battle:
> \### Player
> HP = 6 out of 8
> Attack => 2 (from an item with consumable = no, e.g. permanent)
>
> \### Enemy - Octorok
> HP = 4 of 4 // probably as MVP only allow MAX in the UI, but from a handler perspective allow setting of min and max attributes as i ~ think ~ we can do with the current attribute system?
> Attack => 2 (again this reminds me of how enemies are 'LIKE' items, almost items we can fight............. nearly ..... no difference... except for having HP.. design considerations?)
>
> \### Resolution
> Pre-Battle:
> If player HP = 0; unable to commence the fight
>
> Turn 1:
> Player attacks Octorok (Octorok HP 4 / 4 => 2 / 4)
> Octorok attacks player (Player HP 6 / 8 => 4 / 8)
>
> Turn 2:
> Player attacks Octorok (Octorok 2 / 4 => 0 / 4)
>
> For now we can deal with the 'post battle message' using display_text outcome type
> Player would then receive any other item(s) currency etc from defined Pass Outcomes for the action
> If they lose the battle; Fail Outcomes run
> No default consequence for player losing the battle at this stage (consider anything in the code though, but don't want anything in the UI).. other than not being able to start another fight, or if the host specified any fail outcomes (e.g. remove gold etc.)
>
> Number of times player can battle an enemy is determined by the associated action for the enemy, e.g., safari_item_limit_megan_s_face_134276_asdasd_899361_1 [unlimited / once_per_player / once_globally ]. In the future (potentially even with this build) I'm interested in doing once-per-day/period how safari works with checking the last timestamp)
>
> I'd Rather avoid things like defense for now, method of making enemy stronger = just buff attack; we can save those things for when we upgrade / properly embed the attribute system
>
> Don't want to build the UI yet but some future concept of speed would be fun for turn order (players would also need speed, we do have the default attribute type of dexterity attr_edit_select ['dexterity'], that's kinda like speed .. right?
>
> Lets capture this in a RaP (please include my FULL PROMPT in the top of the RaP, just just the first line - even this text!) and move the other enemy stuff to @docs/archive/ (or cut the text out if it contradicts what we've said here)
>
> Log any key design considerations, options and your recommendation - ultrathink !

---

## The Vision (Plain English)

Enemies are **items that fight back**. They're a new entity type — created by admins, stored like items, managed with the same Entity Edit Framework UI. The difference: they have HP, they have Attack, and when a player encounters one via an action outcome, combat resolves turn-by-turn.

This is NOT a PvE combat engine with AI state machines, loot tables, and raid bosses (that was the old `SafariEnemySystem.md`, now archived). This is a lightweight system where:

1. Admin creates an enemy entity (name, emoji, HP, attack)
2. Admin creates an action with a `fight_enemy` opening outcome
3. Player triggers the action → combat resolves automatically → win/lose determines pass/fail outcomes
4. Rewards (items, currency, etc.) are configured as regular pass outcomes — completely decoupled from the enemy itself

The carlbot Zeldavivor example is the reference point: a text narrative of turn-by-turn combat, resolved synchronously, displayed as a single message.

---

## Architecture

### Enemy Entity

New entity type `ENEMY` in the Entity Edit Framework, stored at:

```
safariContent[guildId].enemies[enemyId]
```

**Entity Definition:**

```javascript
{
  id: 'enemy_deku_baba_123456',
  name: 'Withered Deku Baba',
  emoji: '🌱',          // or custom emoji string '<:DekuBaba:1211188275130404864>'
  description: 'A fairly weak carnivorous plant that you don\'t want to get near!',
  category: 'common',   // cosmetic tag for admin organization

  // Combat stats — simple properties for MVP
  hp: 4,                // max HP per encounter (enemy always starts at max)
  attack: 2,            // damage dealt to player per turn

  // Turn order
  turnOrder: 'player_first',  // 'player_first' | 'enemy_first' | 'simultaneous'

  // Metadata
  metadata: {
    createdBy: 'userId',
    createdAt: 1711612800000
  }
}
```

**Why simple properties, not attributes:**
- Enemy HP is ephemeral — resets every encounter, never persists, never regenerates
- Enemy attack is static — no modifiers, no equipment
- Attribute system's incremental regen is currently broken (dead code path)
- Admin setup stays simple: two number fields, not "create attribute definition, assign to entity, configure regen"
- Data schema is forward-compatible — can later map `hp` → attribute reference

### Entity Edit Framework Integration

| Component | Addition |
|-----------|----------|
| `safariLimits.js` | Add `EDIT_TYPES.ENEMY = 'enemy'`, `MAX_ENEMIES_PER_GUILD: 200` |
| `editFramework.js` | Add `EDIT_CONFIGS[EDIT_TYPES.ENEMY]` with field groups: Info (name, emoji, description, category), Combat (hp, attack, turnOrder) |
| `entityManager.js` | Add `enemy` case to `getEntityPath()` → `guildData.enemies`, add to `loadEntities()` |
| `entityManagementUI.js` | Enemy summary line: `❤️ 4  ⚔️ 2` (like item shows `⚔️ 2  🛡️ 1`) |
| `fieldEditors.js` | Add Combat field group modal (hp number input, attack number input, turnOrder select) |

**Button IDs** (following existing pattern):

```
safari_manage_enemies       — entry point (parallel to safari_manage_items)
entity_select_enemy         — enemy list with search
entity_field_group_enemy_*  — field group editing
entity_delete_mode_enemy_*  — delete confirmation
```

### Comparison: Item vs Enemy

| Aspect | Item | Enemy |
|--------|------|-------|
| name, emoji, description | Yes | Yes |
| category | Yes | Yes |
| attackValue | Yes (numeric) | Yes (`attack`) |
| defenseValue | Yes (numeric) | No (MVP) |
| hp | No | Yes (max, ephemeral per encounter) |
| basePrice | Yes | No |
| consumable | Yes | No |
| quantity | Yes (inventory) | No (template only) |
| In player inventory | Yes | No |
| Managed via Entity Framework | Yes | Yes |
| String Select with search | Yes (>25) | Yes (>25) |
| turnOrder | No | Yes |

The insight is correct: enemies are almost identical to items structurally. The key difference is HP (enemies have it, items don't) and inventory (items live in player inventories, enemies are templates deployed via actions).

---

## New Outcome Type: `fight_enemy`

### Data Model

Added to `ACTION_TYPES` in safariManager.js:

```javascript
FIGHT_ENEMY: 'fight_enemy'
```

**Outcome config:**

```javascript
{
  type: 'fight_enemy',
  order: 1,
  executeOn: 'always',  // Opening outcome — runs before pass/fail branching
  config: {
    enemyId: 'enemy_deku_baba_123456',
    showPreview: false     // Future: show enemy stats before fight starts
  }
}
```

### How It Wires Into Pass/Fail

This is the most critical architectural decision. Currently `executeButtonActions()` does:

```
1. Evaluate conditions → conditionsResult (boolean)
2. Filter ALL outcomes by executeOn matching conditionsResult
3. Sort and execute sequentially
```

Opening outcomes (`executeOn: 'always'`) run regardless. But their results don't influence which pass/fail outcomes run — that's determined entirely by conditions.

**With fight_enemy, the outcome result must drive pass/fail branching.**

#### Recommended Approach: Two-Phase Execution

```javascript
// Phase 1: Evaluate conditions (pre-checks)
const conditionsResult = await evaluateConditions(conditions, context);
if (!conditionsResult) {
  // Conditions failed (e.g., player HP = 0) — run fail outcomes, skip fight
  return executeFailOutcomes();
}

// Phase 2: Execute opening outcomes
let fightResult = null;  // null = no fight, true = won, false = lost
const alwaysOutcomes = button.actions
  .filter(a => a.executeOn === 'always')
  .sort((a, b) => (a.order || 0) - (b.order || 0));

for (const outcome of alwaysOutcomes) {
  const result = await executeOutcome(outcome);
  if (outcome.type === 'fight_enemy') {
    fightResult = result.playerWon;  // true or false
  }
  responses.push(result);
}

// Phase 3: Determine final pass/fail
// If a fight happened, its result overrides condition result
const finalResult = fightResult !== null ? fightResult : conditionsResult;
const resultString = finalResult ? 'true' : 'false';

// Phase 4: Execute conditional outcomes based on finalResult
const conditionalOutcomes = button.actions
  .filter(a => (a.executeOn || 'true') === resultString)
  .sort((a, b) => (a.order || 0) - (b.order || 0));

for (const outcome of conditionalOutcomes) {
  responses.push(await executeOutcome(outcome));
}
```

**Why this works:**
- 100% backwards-compatible — actions without `fight_enemy` behave exactly as before (fightResult stays null, finalResult = conditionsResult)
- Conditions serve as **pre-checks** ("can you even start this fight?")
- Fight result drives **reward branching** ("did you win?")
- Opening `display_text` outcomes still render before the fight (for flavor text like "You encounter a Deku Baba!")
- Pass/fail outcomes (give_item, update_currency, display_text) run after fight resolves

**Change scope in `executeButtonActions()`:** ~20 lines modified. Split the existing execution loop into the two-phase approach. No changes to individual outcome executors.

---

## Combat Resolution Engine

### Algorithm

Synchronous, deterministic, turn-by-turn. All turns calculated at once, displayed as narrative.

```javascript
async function resolveCombat(player, enemy, guildId, userId) {
  const playerAttack = getPlayerAttackValue(guildId, userId);
  if (playerAttack <= 0) {
    return { playerWon: false, narrative: '❌ You have no weapon to fight with!', turns: [] };
  }

  const state = {
    playerHp: player.currentHp,      // from attribute system
    playerMaxHp: player.maxHp,
    playerAttack: playerAttack,       // from best item
    enemyHp: enemy.hp,               // always starts at max
    enemyMaxHp: enemy.hp,
    enemyAttack: enemy.attack,
    turnOrder: enemy.turnOrder || 'player_first'
  };

  const turns = [];
  let turnNumber = 0;

  while (state.playerHp > 0 && state.enemyHp > 0) {
    turnNumber++;
    const turn = { number: turnNumber, events: [] };

    if (state.turnOrder === 'player_first' || state.turnOrder === 'simultaneous') {
      // Player attacks
      state.enemyHp = Math.max(0, state.enemyHp - state.playerAttack);
      turn.events.push({ actor: 'player', damage: state.playerAttack, targetHp: state.enemyHp, targetMaxHp: state.enemyMaxHp });

      // Enemy attacks (if still alive, or simultaneous)
      if (state.enemyHp > 0 || state.turnOrder === 'simultaneous') {
        state.playerHp = Math.max(0, state.playerHp - state.enemyAttack);
        turn.events.push({ actor: 'enemy', damage: state.enemyAttack, targetHp: state.playerHp, targetMaxHp: state.playerMaxHp });
      }
    } else {
      // Enemy first
      state.playerHp = Math.max(0, state.playerHp - state.enemyAttack);
      turn.events.push({ actor: 'enemy', damage: state.enemyAttack, targetHp: state.playerHp, targetMaxHp: state.playerMaxHp });

      if (state.playerHp > 0) {
        state.enemyHp = Math.max(0, state.enemyHp - state.playerAttack);
        turn.events.push({ actor: 'player', damage: state.playerAttack, targetHp: state.enemyHp, targetMaxHp: state.enemyMaxHp });
      }
    }

    turns.push(turn);

    // Safety: cap at 50 turns to prevent infinite loops
    if (turnNumber >= 50) break;
  }

  return {
    playerWon: state.enemyHp <= 0,
    finalPlayerHp: state.playerHp,
    finalEnemyHp: state.enemyHp,
    turns,
    totalTurns: turnNumber
  };
}
```

### Player Attack Source

Player's attack value comes from their **best non-zero attackValue item** in inventory:

```javascript
function getPlayerAttackValue(guildId, userId) {
  const inventory = playerData[guildId]?.players?.[userId]?.safari?.inventory || {};
  const items = safariData[guildId]?.items || {};
  let bestAttack = 0;
  let bestItemId = null;

  for (const [itemId, invEntry] of Object.entries(inventory)) {
    const quantity = typeof invEntry === 'number' ? invEntry : invEntry?.quantity || 0;
    if (quantity <= 0) continue;
    const itemDef = items[itemId];
    if (itemDef?.attackValue > bestAttack) {
      bestAttack = itemDef.attackValue;
      bestItemId = itemId;
    }
  }

  return bestAttack; // 0 if no attack items held
}
```

**Consumable attack items:** If the best item is consumable (`consumable === 'Yes'`), consume 1 after the battle resolves (win or lose — you used the weapon either way). Non-consumable items are permanent weapons.

**No attack items = can't fight.** The combat engine returns a failure message. This means players need to acquire a weapon before fighting — which is good game design (visit a store, find an item on the map, etc.).

### Player HP Integration

Player HP is a **real attribute** managed by the attribute system:

```javascript
// Read player HP before fight
const hpPoints = await getEntityPoints(guildId, `player_${userId}`, 'hp');
// hpPoints = { current: 6, max: 8, ... }

// Pre-battle check
if (hpPoints.current <= 0) {
  return { playerWon: false, narrative: '❌ You don\'t have enough HP to fight!' };
}

// After combat resolves, update player HP
await setEntityPoints(guildId, `player_${userId}`, 'hp', combatResult.finalPlayerHp, hpPoints.max);
```

**Implication:** Servers using enemies MUST have the `hp` attribute enabled. The `fight_enemy` outcome executor should check for this and show a clear admin error if HP isn't configured.

**Note on attribute regen:** The incremental regen path (`calculateRegeneration()`) is currently dead code (see conversation context). For MVP this doesn't block us — HP can regen via:
- `full_reset` type (works, resets to max after interval)
- Manual restoration via `modify_attribute` outcome on another action
- Admin `setEntityPoints` in Player Management
- Simply: hosts configure HP regen as `full_reset` with a long interval, or `none` and manage it via actions

---

## Combat Narrative Display

The outcome returns a Components V2 container showing the battle narrative:

```javascript
function buildCombatDisplay(enemy, combatResult, playerEmoji, enemyEmoji) {
  const lines = [];
  lines.push(`## ${enemyEmoji} ${enemy.name} battle!`);
  lines.push(enemy.description);
  lines.push('');

  for (const turn of combatResult.turns) {
    lines.push(`**Turn ${turn.number}**`);
    for (const event of turn.events) {
      if (event.actor === 'player') {
        lines.push(`${playerEmoji} attacks ${enemyEmoji} ${enemy.name} for **${event.damage}** damage (${enemyEmoji} ${event.targetHp}/${event.targetMaxHp})`);
      } else {
        lines.push(`${enemyEmoji} ${enemy.name} attacks you for **${event.damage}** damage (❤️ ${event.targetHp}/${event.targetMaxHp})`);
      }
    }
    lines.push('');
  }

  if (combatResult.playerWon) {
    lines.push(`**Victory!** ${enemyEmoji} ${enemy.name} has been defeated!`);
  } else {
    lines.push(`**Defeat!** You were beaten by ${enemyEmoji} ${enemy.name}...`);
  }

  return {
    type: 17, // Container
    accent_color: combatResult.playerWon ? 0x57F287 : 0xED4245,
    components: [{ type: 10, content: lines.join('\n') }]
  };
}
```

This display is returned as part of the action's response array, alongside any other opening outcomes (display_text flavor before the fight, etc.).

---

## Action Editor UI — Outcome Configuration

When admin adds a `fight_enemy` outcome in the Action Editor:

1. Select outcome type → `⚔️ Fight Enemy` (new option in the type dropdown)
2. Entity String Select appears → pick an enemy from the guild's enemy list (uses `createEntitySelector('enemy')`)
3. Enemy selected → config saved: `{ enemyId: 'enemy_xyz' }`

**MVP config is just the enemy selection.** Future config options:
- `showPreview: true/false` — show enemy stats before fight
- Turn order override (default: use enemy's configured turnOrder)

The outcome summary in the Action Editor shows:
```
1. ⚔️ Fight Enemy | 🌱 Withered Deku Baba (❤️4 ⚔️2)
```

---

## Usage Limits / Battle Frequency

**Entirely handled by the existing action system.** The action containing the `fight_enemy` outcome has its own usage limits on its sub-actions:

- `unlimited` — fight as many times as you want
- `once_per_player` — each player can fight once (tracked via `claimedBy[]`)
- `once_globally` — first player to trigger wins

**Future: once-per-period.** The user expressed interest in time-based limits (once per day, etc.). This would be an enhancement to the action limit system itself, not specific to enemies. The existing `lastUse` / `lastRegeneration` timestamp patterns could inform a `once_per_period` limit type with configurable interval. This applies equally to all outcome types.

---

## Key Design Decisions

### Decision 1: Enemy Stats — Simple Properties vs Attributes

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A: Simple properties** | `enemy.hp = 4`, `enemy.attack = 2` as plain numbers on the entity | Simple admin setup, no attribute system dependency, no broken regen concern | Divergent from player stat model, less extensible |
| **B: Full attribute integration** | Enemy gets attribute instances via `initializeEntityPoints('enemy_xyz', ...)` | Consistent with player system, extensible | Attribute incremental regen is broken (dead code), per-encounter cleanup needed, heavier admin setup |
| **C: Hybrid (simple storage, attribute vocabulary)** | Store as simple properties, display using attribute formatting, migrate later | Simple now, consistent display, clear upgrade path | Two representations during transition |

**Recommendation: Option A (simple properties) for MVP.** Enemy stats are ephemeral per encounter — they don't need regen, persistence, or the full attribute lifecycle. The entity definition stores `hp` and `attack` as plain numbers. Combat creates a local state object from these values. When the attribute system's incremental regen is fixed and mature, enemies can migrate to real attributes.

**Forward-compatibility:** Store fields as `hp` and `attack` (not `maxHp` or `attackValue`) so they map cleanly to attribute IDs later.

### Decision 2: Player Attack Source

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A: From items (current system)** | Player's attack = best `attackValue` item in inventory | Zero new infrastructure, consistent with PvP, creates weapon acquisition gameplay | No way to fight without items, consumable item questions |
| **B: Player attack attribute** | New `attack` attribute on players, optionally boosted by items | Consistent with enemy model, standalone combat capability | New attribute to manage, diverges from existing PvP |
| **C: Configured per-outcome** | `fight_enemy` config includes `playerAttack: 3` | Most flexible, no item dependency | Static, not dynamic, boring |

**Recommendation: Option A (from items).** This creates natural gameplay progression — players need to find/buy a weapon before fighting enemies. Matches the user's example ("Attack => 2 from an item with consumable = no"). Consumable handling: consume 1 item after battle if the best item used was consumable.

**Consideration: What if player has ONLY consumable attack items?** Each fight consumes one. If they run out, they can't fight. This is intentional and creates resource management gameplay. The admin can configure a non-consumable weapon as a default/starter item if they want.

### Decision 3: Turn Order — Where to Configure

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A: On enemy entity** | `enemy.turnOrder = 'player_first'` | Simple, per-enemy flavor (fast enemies go first), reusable across actions | Can't vary per-action (same enemy always has same turn order) |
| **B: On outcome config** | `config.turnOrder = 'enemy_first'` | Per-action flexibility | Repetitive if same enemy used in multiple actions |
| **C: Both (outcome overrides enemy default)** | Enemy has default, outcome config can override | Maximum flexibility | More complexity to explain |
| **D: Global setting** | Guild-wide default | Simplest setup | No per-enemy customization |

**Recommendation: Option A (on enemy entity) for MVP, Option C for future.** The enemy IS the thing with speed/initiative — it makes sense as an enemy property. Default: `'player_first'`. Future: outcome config can override, and speed attribute can determine order dynamically.

### Decision 4: Combat Model — Synchronous vs Interactive

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A: Synchronous (all turns resolve at once)** | Calculate all turns, display as narrative | Simple, fits in one interaction, no state management, matches carlbot reference | No player choice during combat |
| **B: Interactive (button per turn)** | Each turn shows Attack/Defend/Flee/Use Item buttons | Engaging, tactical, real gameplay | Multi-interaction state, timeout issues (15 min token expiry), ephemeral state management |

**Recommendation: Option A (synchronous) for MVP.** The carlbot example shows this exact pattern. Interactive combat is a clear future enhancement once the base system is proven. The combat engine's `resolveCombat()` function can later be wrapped in an interactive loop without changing the resolution logic itself.

### Decision 5: Fight Result → Pass/Fail Wiring

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| **A: Fight as condition type** | `ENEMY_BATTLE` in CONDITION_TYPES, resolved during condition evaluation | Fits existing condition→pass/fail flow | Conditions are pre-checks, not gameplay. Fight would run before opening display_text. |
| **B: Two-phase execution** | Opening outcomes run first (including fight), result overrides conditionsResult for pass/fail | Clean separation: conditions = pre-checks, fight = gameplay, outcomes = rewards. 100% backwards-compatible. | ~20 lines changed in executeButtonActions() |
| **C: Fight outcome has embedded sub-outcomes** | `fight_enemy` config includes onWin/onLose outcome arrays | Self-contained | Creates nested outcome system, diverges from flat pass/fail model |

**Recommendation: Option B (two-phase execution).** This is the cleanest architecture. Conditions check prerequisites (player HP > 0, has required item, etc.). Opening outcomes set the scene and run the fight. The fight result flows into pass/fail branching for rewards. No new concepts for admins — they already understand "opening outcomes run first, then pass/fail."

### Decision 6: Enemies and the Attribute System — Alignment Strategy

Current state:
- Player HP exists as an attribute preset (`hp` in `attributeDefaults.js`) with `category: 'resource'`
- Player attributes are managed via `initializeEntityPoints()` / `getEntityPoints()` / `setEntityPoints()`
- Enemy HP is a simple property (MVP decision)
- The Points Manager is already entity-agnostic (accepts any `entityId` string)

**Alignment path (not for MVP, but informs design):**

| Phase | Change | Impact |
|-------|--------|--------|
| MVP | Enemy has simple `hp` and `attack` properties. Player HP is a real attribute. Enemy attacks call `setEntityPoints()` to modify player HP. | Minimal. Enemy side is standalone, player side uses existing attribute system. |
| Phase 2 | Add `defense` property to enemies. Damage formula becomes `max(1, attack - defense)`. | Additive, no refactor. |
| Phase 3 | Enemy stats become attribute references. Enemy entity stores `attributes: { hp: { max: 4 }, attack: { value: 2 } }`. Combat reads from this structure. | Schema migration, backwards-compatible if old format detected. |
| Phase 4 | Enemies use `initializeEntityPoints()` for HP — enables regen, persistent world-boss HP, etc. Requires fixing incremental regen. | Significant, but attribute system improvements benefit all entity types. |

**Key principle:** Don't block on the attribute system. Use it where it's ready (player HP), work around it where it's not (enemy stats). The data schema should make migration painless.

### Decision 7: What About Defense?

The user explicitly said: "I'd rather avoid things like defense for now, method of making enemy stronger = just buff attack."

**MVP:** No defense stat. Damage = attack value, period. Making enemies harder = increase their HP or attack. Making players stronger = find items with higher attackValue.

**Future:** Add `defense` to enemies (and potentially players via items/attributes). Damage formula: `max(1, attackerAttack - defenderDefense)`. The `max(1, ...)` floor ensures combat always progresses.

### Decision 8: Speed / Turn Order Future

The user noted: "some future concept of speed would be fun for turn order (players would also need speed, we do have the default attribute type of dexterity `attr_edit_select ['dexterity']`, that's kinda like speed)"

**Future design sketch:**
- Enemy gets `speed` property (or attribute)
- Player's speed comes from Dexterity attribute
- Turn order: higher speed goes first. Ties: configurable (default player)
- This replaces the simple `turnOrder: 'player_first'` enum

**No action needed for MVP.** The `turnOrder` field on the enemy entity is the placeholder. When speed becomes a real stat, `turnOrder` becomes `'speed_based'` as a third option and the resolution function compares speed values.

---

## Data Flow Diagram

```
ADMIN SETUP:
  Create Enemy Entity (Entity Edit Framework)
    → safariContent[guildId].enemies[enemyId] = { name, emoji, hp, attack, turnOrder }
  Create Action with fight_enemy outcome
    → safariContent[guildId].buttons[actionId].actions[] includes { type: 'fight_enemy', config: { enemyId } }
  Configure pass outcomes (give_item, update_currency, display_text)
  Configure fail outcomes (display_text, remove currency, etc.)
  Place action on map / player menu / item trigger

PLAYER RUNTIME:
  Player triggers action (button click, item use, text command)
    │
    ├─ Evaluate conditions (e.g., attribute_check: player HP > 0)
    │   └─ FAIL → run fail outcomes → done
    │
    ├─ Execute opening outcomes (executeOn: 'always')
    │   ├─ display_text: "You encounter a Withered Deku Baba!"
    │   └─ fight_enemy:
    │       ├─ Load enemy template from enemies[enemyId]
    │       ├─ Load player HP from attribute system
    │       ├─ Load player attack from best inventory item
    │       ├─ Resolve combat (turn-by-turn, synchronous)
    │       ├─ Update player HP attribute (setEntityPoints)
    │       ├─ If best item was consumable: consume 1
    │       ├─ Return combat narrative display
    │       └─ Set fightResult = playerWon (true/false)
    │
    ├─ fightResult overrides conditionsResult
    │
    ├─ WIN → execute pass outcomes
    │   ├─ give_item: "🗡️ Deku Stick x1"
    │   ├─ update_currency: "+50 rupees"
    │   └─ display_text: "You found a Deku Stick!"
    │
    └─ LOSE → execute fail outcomes
        └─ display_text: "The Deku Baba was too strong..."
```

---

## File Changes Summary

| File | Changes |
|------|---------|
| `config/safariLimits.js` | Add `EDIT_TYPES.ENEMY`, `MAX_ENEMIES_PER_GUILD` |
| `editFramework.js` | Add `EDIT_CONFIGS[EDIT_TYPES.ENEMY]` with Info + Combat field groups |
| `entityManager.js` | Add `enemy` case to `getEntityPath()`, `loadEntities()`, `createEntity()` |
| `entityManagementUI.js` | Add enemy summary line formatter |
| `fieldEditors.js` | Add Combat field group modal builder (hp, attack, turnOrder) |
| `safariManager.js` | Add `FIGHT_ENEMY` to `ACTION_TYPES`, `resolveCombat()`, `buildCombatDisplay()`, `getPlayerAttackValue()`. Modify `executeButtonActions()` for two-phase execution. |
| `customActionUI.js` | Add `⚔️ Fight Enemy` to outcome type dropdown, enemy selector in outcome config |
| `app.js` | Add handlers for `safari_manage_enemies`, enemy entity CRUD buttons, `fight_enemy` outcome config |
| `buttonHandlerFactory.js` | Register new button IDs in BUTTON_REGISTRY |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Two-phase execution breaks existing actions | Medium | `fightResult` starts null, only overrides when fight_enemy is present. Zero behavior change for existing actions. Unit test: action without fight_enemy behaves identically before/after. |
| Player has no HP attribute configured | Medium | `fight_enemy` executor checks for HP attribute existence. Shows admin-facing error: "⚠️ Enable the HP attribute before using Fight Enemy outcomes." |
| Player has no attack items | Low | Pre-fight check returns clear message: "❌ You need a weapon to fight!" |
| Infinite combat loop (equal stats, simultaneous) | Low | 50-turn safety cap. If reached, player loses (defender advantage). |
| Combat narrative exceeds Discord message limit | Low | Cap narrative to 4000 chars. Summarize middle turns if too long: "...3 more turns of combat..." |
| Enemy deleted while referenced by action | Low | Combat executor checks enemy exists. Missing enemy → "⚠️ This enemy no longer exists." Same pattern as deleted items in give_item. |
| Consumable weapon consumed on loss | Low | Intentional — you used the weapon, it's gone. If admins want risk-free fights, use non-consumable weapons. |

---

## Testing Strategy

```
tests/enemyCombat.test.js
├─ resolveCombat() — player first, player wins
├─ resolveCombat() — enemy first, player loses
├─ resolveCombat() — simultaneous, double KO
├─ resolveCombat() — 50-turn safety cap
├─ resolveCombat() — player attack = 0 (no weapon)
├─ getPlayerAttackValue() — picks highest attackValue item
├─ getPlayerAttackValue() — skips items with quantity 0
├─ getPlayerAttackValue() — returns 0 if no attack items
├─ buildCombatDisplay() — victory formatting
├─ buildCombatDisplay() — defeat formatting
└─ two-phase execution — fightResult overrides conditionsResult
```

---

## Open Questions

1. **Should the combat narrative use the player's Discord display name or a configured "adventurer name"?** (For MVP: Discord display name or generic "You")
2. **Multiple fight_enemy outcomes in one action?** (For MVP: support but probably not useful. Last fight's result determines pass/fail.)
3. **Can an enemy be used in multiple actions?** (Yes — enemies are templates. Same Octorok can guard multiple locations.)
4. **`once_per_period` limit type** — The user expressed interest. This is an action system enhancement, not enemy-specific. Should it be scoped into this build or tracked separately?

---

## Future Enhancements (Not MVP)

- **Interactive combat** (Attack/Defend/Flee/Use Item buttons per turn)
- **Defense stat** on enemies and players
- **Speed/Dexterity-based turn order**
- **Enemy attribute integration** (real attribute instances, persistent HP for world bosses)
- **Boss mechanics** (phase changes at HP thresholds — configurable via conditions on sub-actions)
- **Multiple enemies per encounter** (fight 3 Deku Babas in sequence or parallel)
- **Enemy preview** before fight (show stats, let player choose to fight or flee)
- **Stat scaling** (enemy scales to player level/attributes)
- **Combat log channel** (post battle results to a Discord channel for spectators)

---

Related: [Attribute System Analysis](0964_20260109_AttributeSystem_Analysis.md) | [Item-Triggered Actions](0954_20260303_ItemTriggeredActions_Analysis.md) | [Custom Actions](../03-features/SafariCustomActions.md)
Supersedes: [SafariEnemySystem (archived)](../archive/SafariEnemySystem-Superseded.md)
