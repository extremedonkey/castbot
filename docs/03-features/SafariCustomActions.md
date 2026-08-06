# Safari Custom Actions Documentation

## Terminology

> **Standardized terminology** — use these terms consistently in code, docs, and UI:
>
> | Concept | Preferred Term | Legacy Names (still in code/data) | Data Path |
> |---------|---------------|-----------------------------------|-----------|
> | The top-level entity (e.g., `harvest_and_attack_test_1772798001927`) | **Action** | Custom Action, Safari Button, button, interactive action | `safariData[guildId].buttons[actionId]` |
> | How an Action is invoked | **Trigger** | Button Click, Text Command, Modal, Player Command | `action.trigger.type` — see [Trigger Types](#trigger-types) below |
> | An individual step an Action executes | **Outcome** | Action Type, sub-action, action component | `action.actions[]` — each has `.type` and `.config` |
>
> **Why "buttons" in the data path?** The storage key `guildData.buttons` is a legacy artifact from when Actions could only be triggered by button clicks. Renaming it would require a data migration, so it stays — but conceptually it holds **Actions**, not buttons.

## Trigger Types

The trigger type selector (`customActionUI.js` → `createTriggerConfigUI()`) offers exactly five values. **There is no `'select'` trigger type** — no code path creates, checks, or renders one; treat any doc or memory claiming otherwise as stale.

| UI Label | `trigger.type` value | Behavior |
|---|---|---|
| Button Click | `button` | Player or host clicks a button. |
| Command | `modal` | Player types a phrase via the 🕹️ Enter Command button (map location or player menu). Matched against `trigger.phrases[]`. Despite the value name, this is the **text command** trigger, not a modal popup. |
| Button + Secret Code | `button_modal` | Player clicks a button; a modal pops up asking for a phrase. Correct phrase (`trigger.phrases[]`) → pass outcomes run; wrong → fail outcomes run. |
| Button + User Input | `button_input` | Player clicks a button; a modal captures free text, exposed to outcomes as `{triggerInput}`. |
| Scheduled Action | `schedule` | Fires automatically at a set time. Arming vs. firing is two-phase: invoking a `schedule`-trigger action arms a timer (`armScheduledAction()` in `scheduledActionManager.js`) instead of running outcomes immediately; the scheduler calls back into `executeButtonActions()` with `{ scheduledExecution: true }` at fire time to actually run them. |

All five can be attached to the same deployment surfaces (map coordinates, global actions, Post to Channel, Crafting menu); `modal`-type (Command) actions are the exception — they never render as a clickable button, so they're invoked only via the Enter Command flow.

## Overview

Actions are dynamic, configurable workflows that can be triggered by players through buttons, text commands, select menus, or schedules. They support complex workflows including text displays, currency/item drops, linked actions, and conditional logic.

## Recent Updates (January 2026)

### Give / Remove Item Action
The `give_item` action now supports both **giving** and **removing** items via an `operation` field:
- **Give Item** (default): Adds items to player inventory
- **Remove Item**: Removes items from player inventory (for crafting, penalties, quest mechanics)
- **Backwards Compatible**: Existing actions default to "give" operation
- **Smart Messages**: Different feedback based on whether player had enough items

### UI Label Updates
- "Give Item" → "Give / Remove Item" in action type selector
- "Give Currency" → "Give / Remove Currency" in action type selector

---

## Previous Updates (January 2025)

### String Select Interface
Actions now use a string select dropdown for adding outcome types, replacing the previous button grid approach:
- **Cleaner UI**: Single dropdown instead of multiple buttons
- **Scalable**: Easy to add new outcome types
- **Consistent**: Matches other UI patterns in CastBot

### Button Bundling
Linked actions (follow_up_button outcomes) are automatically bundled with preceding display_text actions:
- **Reduces message clutter**: Combines related content
- **Better UX**: Logical grouping of text and actions
- **Automatic**: No configuration needed

### Drop Management Integration
Custom Actions now support the same drop management features as map locations:
- **Item Drops**: Give items with usage limits
- **Currency Drops**: Award currency with restrictions
- **Usage Tracking**: Once per player, once globally, or unlimited

## Outcome Types

> **All three of Display Text, Give / Remove Item and Give / Remove Currency are created from a
> SINGLE modal** opened straight from the Add Outcome select. Their Container screens remain the
> **edit** surface (Outcome list → Edit) because Custom usage-limit sub-screens and the image
> preview can't live inside a modal. Every other outcome type still opens a Container to create.

### 1. Display Text
Shows formatted text with optional images and styling.

Create opens `buildDisplayTextModal` ([customActionUI.js](../../customActionUI.js)) via
`buildDisplayTextCreateModal`, submitting to `safari_display_text_save_{buttonId}_{actionIndex}`.

**Configuration:**
- Title (optional, ≤100 chars)
- Content (required, ≤2000 chars)
- Accent Color (optional)
- Image — **either** a paste-URL text input **or** a native File Upload (type 19), depending on
  the guild's `imageUploadMode` (`buildImageFieldLabel` decides; see [ImageUploads.md](ImageUploads.md))
- **Executes if** — Radio Group, **create only**. On edit the outcome already has a branch and the
  outcome context menu's *Move to…* owns changing it, so the field is omitted rather than offering
  two controls that can disagree.

Unlike the other two, saving this modal returns to the Display Text **Container**, not the Action
Editor — that screen is where the image preview lives.

### 2. Give / Remove Item
Awards or removes items from players with configurable usage limits.

Create opens `buildGiveItemModal`, submitting to `safari_item_quick_{buttonId}_{executeOn}`.
Five Labels — Discord's cap:

| Field | Control | Notes |
|---|---|---|
| **Item** | String Select, **optional** | Caps at Discord's 25 options and always states how many it left out. **Leave it blank** to fall through to the full picker (which has search) — the escape hatch for guilds holding >25 items |
| **Quantity** | Text Input | Always positive; 1–99999. Direction is the next field, never the sign |
| **Give or Remove** | Radio Group | An explicit mode switch, deliberately unlike currency's negative amount — removes are ~45% of item outcomes |
| **Usage Limit** | Radio Group | `unlimited` · `once_per_player` (pre-selected) · `once_globally` · `once_per_period`. **Custom… and Usage Templates are absent** — their sub-screens need the Container |
| **Executes if** | Radio Group | Defaults to the branch you clicked Add Outcome under |

Picking **Once Per Period** here hard-codes a **1 day** period (`QUICK_PERIOD_MS`) — change it
afterwards in Outcome Config. Blank-item submits carry your other answers to the picker via
`dropConfigState` key `` `${guildId}_${buttonId}_pending` ``, consumed on first read.

The item select is shared with Quick Create via [utils/itemSelectField.js](../../utils/itemSelectField.js) —
change the truncation messaging there, not at either call site.

**Give Example:**
```javascript
{
  type: 'give_item',
  config: {
    itemId: 'iron_sword_123',
    quantity: 1,
    operation: 'give',  // Default - can be omitted
    limit: {
      type: 'once_per_player',
      claimedBy: ['userId1', 'userId2']
    }
  }
}
```

**Remove Example:**
```javascript
{
  type: 'give_item',
  config: {
    itemId: 'health_potion_456',
    quantity: 2,
    operation: 'remove',  // Takes items from player
    limit: {
      type: 'unlimited'  // Can keep attempting removal
    }
  }
}
```

**Player Messages:**
| Scenario | Message |
|----------|---------|
| Give success | 🎁 You receive **3x** of 🧪 **Health Potion**! |
| Remove (had enough) | 🧨 You lose **2x** of 🧪 **Health Potion**! |
| Remove (partial) | 🧨 An attempt was made to remove **5x** of 🧪 **Health Potion**, but you only had **2x** available.<br>You now have **0x** of 🧪 **Health Potion**. |

**Use Cases:**
- **Crafting**: Remove base materials, give crafted item
- **Penalties**: Troll smashes your health potion
- **Quest mechanics**: Consume quest items on completion
- **Conditional logic**: Check if player has item, then remove it

### 3. Give / Remove Currency
Awards or deducts currency, claim-gated by a usage limit.

**Creating one is a single modal.** Picking `Give / Remove Currency` from the Add Outcome
select opens a 3-field modal (Amount · Usage Limit · Executes if) and returns straight to the
Action Editor — one interaction, not the five the old Container flow needed. Builder:
`buildGiveCurrencyModal()` in [customActionUI.js](../../customActionUI.js), submitted to
`safari_currency_quick_{buttonId}_{executeOn}`.

- **Usage Limit** pre-selects **Once Per Player**. Discord ignores `default: true` on String
  Selects *inside modals*, so the default is also named in the placeholder and re-applied by
  the submit handler — don't "fix" one of those three without the others.
- **Executes if** defaults to whichever branch the admin clicked Add Outcome under. The
  `always` option only appears for an always-branch outcome, so rendering the select can't
  silently demote one to conditional.
- **`Custom…` and Usage Templates are deliberately absent** — their config sub-screens can't
  live inside a modal. Pick them from the Container editor instead.

**Editing** still uses the legacy Container screen (`showGiveCurrencyConfig`), reached from the
Outcome list → Edit. Both surfaces write byte-identical `config.limit` shapes; the assertion
that they stay identical lives in [tests/quickCurrencyOutcome.test.js](../../tests/quickCurrencyOutcome.test.js).

**Configuration:**
- Amount (positive to give, negative to remove; 0 is rejected)
- Message (optional flavor text — set via import/export or Ask CastBot, not the modal)
- Usage limit (see [Usage Limits](#usage-limits))

**Player-facing amounts are the APPLIED delta, not the configured one.** Balances floor at 0,
so a `-50` outcome against a balance of 10 takes 10 and says so — see `executeGiveCurrency` in
[safariManager.js](../../safariManager.js).

**Example:**
```javascript
{
  type: 'give_currency',
  config: {
    amount: 100,
    message: 'You found treasure!',
    limit: {
      type: 'once_globally',
      claimedBy: 'userId123' // Single user for global limit
    }
  }
}
```

### 4. Linked Action (follow_up_button)
Triggers another Action.

**Configuration:**
- Target Custom Action ID
- Automatically bundles with preceding display_text

### 5. Conditional Action
Executes different actions based on conditions.

**Configuration:**
- Condition type and parameters
- Success actions
- Failure actions

### 6. Modify Attribute
Modifies player attributes (HP, Mana, Strength, etc.).

**Configuration:**
- Attribute to modify
- Operation: Add, Subtract, or Set
- Amount
- Display mode (silent or feedback)
- Usage limits

See [Attribute System](../../01-RaP/0964_20260109_AttributeSystem_Analysis.md) for details.

---

## Condition Types

Conditions determine whether actions execute. Multiple conditions can be combined with AND/OR logic.

| Type | Icon | Description | Example |
|------|------|-------------|---------|
| **Currency** | 🪙 | Check player's currency | Currency ≥ 100 |
| **Item** | 📦 | Check if player has/doesn't have item | Has Gold Key |
| **Role** | 👑 | Check if player has/doesn't have Discord role | Has @VIP role |
| **Attribute** | 📊 | Check single attribute value | Mana ≥ 20, HP < 50% |
| **Compare Attributes** | ⚔️ | Compare two attributes | Strength > Dexterity |
| **Multi-Attribute** | 📈 | Check multiple attributes | All stats ≥ 10 |
| **Random Probability** | 🎲 | Randomized dice-style pass/fail check | 75% chance of pass |
| **D20 Roll** | 🐉 | D&D-style d20 roll vs. a DC, with modifiers/crits/fumbles | Roll + modifier ≥ DC 12 |

### Attribute Conditions

Check player attributes with flexible comparison options:

- **Resource attributes** (HP, Mana, Stamina): Compare current, max, or percentage
- **Stat attributes** (Strength, Dexterity): Compare value
- **Operators**: ≥, ≤, =, >, <
- **Item Bonuses**: Optionally include equipment modifiers

**Example**: "If Mana current ≥ 20" → displays as `📊 mana ≥ 20`

### Compare Attributes (⚔️)

Compare two attributes against each other:

- Compare any two attributes (same or different types)
- Supports resource targets (current/max/percent) for each
- Optional item bonus inclusion

**Example**: "If Strength > Dexterity" → displays as `⚔️ strength ≥ dexterity`

### Multi-Attribute Check (📈)

Check multiple attributes with aggregation modes:

- **All**: Every attribute must pass (e.g., "All stats ≥ 10")
- **Any**: At least one must pass (e.g., "Any stat ≥ 20")
- **Sum**: Total of all values (e.g., "Sum of stats ≥ 50")
- **Average**: Average of all values (e.g., "Average stat ≥ 15")

Shortcuts: `all_stats`, `all_resources`, `all`

See [Attribute Conditions](./AttributeConditions.md) for full documentation.

### Random Probability (🎲) and D20 Roll (🐉)

Chance-based conditions — evaluate alongside other conditions using the same AND/OR logic (e.g., "has Sword" AND "75% chance" = must have the sword, then roll).

- **Random Probability** (`type: 'random_probability'`): a configurable percentage chance of passing. Display modes: text-only result card, compact probability %, or silent (logged only).
- **D20 Roll** (`type: 'd20_roll'`): rolls 1d20 + modifier against a target DC, with crit/fumble flavor text. Display modes: full D&D-style narration, roll + result card, compact one-liner, or silent.

Both are implemented in `evaluateSingleCondition()` in `safariManager.js`, configured via the condition editor in `customActionUI.js`, and rendered via `buildProbabilityResultDisplay()` / `buildD20ResultDisplay()` in `diceRoll.js`. `fight_enemy` outcomes use the same underlying roll mechanics for combat resolution. Full design rationale: [RaP 0942 — Random Probability](../01-RaP/0942_20260316_RandomProbability_Analysis.md) (note: despite that doc's stale "ready to build" status header, this feature is shipped and live in the condition type selector).

---

## Creating Actions

### Step 1: Access Actions
1. Use `/prod_menu` → Safari Menu
2. Select "📌 Manage Custom Actions"
3. Choose location or create a global action

### Step 2: Create New Action
1. Click "Create New" from the dropdown
2. Enter action details:
   - **ID**: Unique identifier (auto-generated)
   - **Name**: Display name
   - **Description**: Purpose/usage
   - **Trigger Type**: Button or Text Command

### Step 3: Add Outcomes
1. Use the string select dropdown to add outcomes
2. Configure each outcome's settings
3. Outcomes execute in order

### Step 4: Configure the outcome
There is no multi-step "configure drops" flow any more. Picking **Display Text**, **Give / Remove
Item** or **Give / Remove Currency** opens one modal that captures everything and lands you back on
the Action Editor (Display Text lands on its config Container instead — see above). Every other
outcome type opens a Container to configure.

The one branch: leaving the item modal's **Item** select blank routes you to the search picker,
carrying your other answers with you.

**Button appearance is not part of an outcome.** Label, emoji and style belong to the parent
Action's Trigger Type menu — outcomes have no button of their own.

## Usage Limits

Every rewarding outcome can be claim-gated via `action.config.limit`. There are four presets plus a configurable **Custom** type and server-saved **Usage Templates**.

| Type | Summary |
|---|---|
| `unlimited` | No tracking, always allowed (default) |
| `once_per_player` | Each player once, ever (`claimedBy` array) |
| `once_globally` | One player ever, total (`claimedBy` string) |
| `once_per_period` | Per-player rolling cooldown (`claimedBy` `{uid:ts}`) |
| `custom` | Orthogonal `maxClaims × scope × unique × reset` + the ⚙️ Custom UI |

📖 **Full reference — types, the custom engine, Usage Templates, the Player Claims admin, and player-facing copy — lives in [SafariUsageLimits.md](SafariUsageLimits.md).**

## Outcome Config (the edit Container)

Reached from the outcome context menu → **Edit Outcome**. `showGiveItemConfig` /
`showGiveCurrencyConfig` render:

1. **Quantity / Amount**
2. **Usage Limit** select — the only place offering **⚙️ Custom…** and saved **Usage Templates**
3. **Give / Remove** operation (item only)
4. **Executes if**
5. **👥 Player Claims** — opens the per-player claims manager
6. **Delete Action** · **Save & Finish**

> This screen was previously documented as "reused from map drops", with button-text/emoji/style
> fields and a "Reset Claims" button. None of that holds: map drops were removed entirely
> (commit `88447d75`), outcomes have never had their own button styling, and the control is
> **Player Claims**, not Reset Claims.

## Claim Gating (there are no claim-aware button states)

Buttons are **not** disabled or relabelled based on who has claimed. Gating happens at
**execution** time: `reserveClassicClaim` ([safariManager.js](../../safariManager.js)) evaluates
`evaluateClassicGate` and records the claim inside one `withSafariLock` cycle *before* granting the
reward, rolling back if the grant fails. A blocked player gets an ephemeral message —
e.g. `❌ You have already claimed this reward!`

> An earlier version of this doc described disabled grey buttons reading "[Reward] - Already
> claimed" / "Claimed by [Username]". No code has ever implemented that; those strings appear
> nowhere in the codebase. Don't build against it.

## Admin Features

### Testing Commands
Admins can now test text command triggers:
1. Click Location Actions for any coordinate
2. Use "Test Command" button (appears for admins only)
3. Enter command text to simulate player input

### Reset Claims
Admins can reset usage tracking:
1. Edit the Action
2. Navigate to the drop configuration
3. Click "Reset Claims"
4. Confirm the reset

### Bypass Limits
Admins with appropriate permissions can bypass usage limits for testing.

## Data Storage

### Actions
Stored in `safariContent.json` (under legacy key `buttons`):
```javascript
{
  "guildId": {
    "buttons": {
      "actionId": {
        "id": "actionId",
        "name": "Treasure Chest",
        "actions": [
          {
            "type": "give_item",
            "order": 1,
            "config": {
              "itemId": "gold_coin",
              "quantity": 5,
              "operation": "give",
              "limit": {
                "type": "once_per_player",
                "claimedBy": []
              }
            }
          }
        ]
      }
    }
  }
}
```

### Usage Tracking
Claims are tracked within each action's config:
- `claimedBy: []` - Array for per-player limits
- `claimedBy: "userId"` - Single ID for global limits
- `claimedBy: {userId: timestamp}` - Per-period cooldowns
- No `claimedBy` field for unlimited actions

**Claiming is reserve-then-grant, under a lock.** `reserveClassicClaim()` in
[safariManager.js](../../safariManager.js) reads the LIVE limit, evaluates the gate
(`evaluateClassicGate()` in [claimsManager.js](../../claimsManager.js) — pure, unit-tested) and
records the claim inside **one** `withSafariLock` cycle, *before* the reward is granted; the
executor rolls back with `clearClaim` if the grant then fails. Gate and claim used to be two
separate unlocked load→mutate→save cycles, which let two players both win the same
`once_globally` drop. If you add a new claim-gated outcome type, call `reserveClassicClaim` —
do not re-implement the check.

### Player Inventory
Items are added to `playerData.json`:
```javascript
{
  "guildId": {
    "players": {
      "userId": {
        "safari": {
          "inventory": {
            "gold_coin": {
              "quantity": 5,
              "firstObtained": 1234567890
            }
          }
        }
      }
    }
  }
}
```

## Best Practices

### 1. Logical Action Order
- Place display_text before linked actions for automatic bundling
- Put give_item/currency after explanatory text
- Use conditional actions for branching logic

### 2. Clear Reward Communication
- Use descriptive button text
- Include reward details in display_text
- Provide feedback messages for all outcomes

### 3. Balanced Limits
- Use "once per player" for personal rewards
- Use "once globally" for server-wide achievements
- Use "unlimited" sparingly to prevent spam

### 4. Testing Workflow
1. Create action in test location
2. Test all paths (success/failure/limits)
3. Verify inventory/currency updates
4. Check button states
5. Reset claims and retest

## Troubleshooting

### "Already claimed" not showing
- Verify usage tracking is enabled
- Check `claimedBy` array in safariContent.json
- Ensure button ID matches in all handlers

### Items not appearing in inventory
- Confirm item exists in Safari items
- Check player has initialized Safari data
- Verify no errors in execution logs

### Currency not updating
- Check for negative balance prevention
- Verify amount is valid number
- Look for rate limiting issues

### Buttons not disabling
- Ensure claim check runs before render
- Verify button uses latest state
- Check for caching issues

## Migration Guide

### Updating Existing Currency Actions
Existing `update_currency` actions will default to unlimited. To add limits:

1. Edit the Action
2. Select the currency outcome
3. Choose usage limit
4. Save changes

### Converting Location Drops
To convert map-based drops to Custom Actions:

1. Create new Action
2. Add give_item/currency outcome
3. Copy drop settings
4. Update location to use Action
5. Remove old drop configuration

## Related Documentation

- [Safari.md](./Safari.md) - Main Safari system overview
- [QuickCreateActions.md](./QuickCreateActions.md) - One-modal shortcuts (Quick Text, Item, ItemText, Currency, Enemy, Command, Crafting) that create Actions in a single step
- [SafariMapExplorer.md](./SafariMapExplorer.md) - Map and location management
- [EntityEditFramework.md](../architecture/EntityEditFramework.md) - UI framework details
- [ButtonHandlerFactory.md](../architecture/ButtonHandlerFactory.md) - Button implementation patterns