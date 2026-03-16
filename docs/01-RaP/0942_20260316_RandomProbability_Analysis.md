# Random Probability Condition — Dice Rolls for Actions

> **RaP #0942** | 2026-03-16
> **Status**: Specification — ready to build
> **Related**: [Challenge Actions RaP](0943_20260316_ChallengeActions_Analysis.md), [Action Terminology RaP](0956_20260308_ActionTerminology_Analysis.md), [SafariCustomActions](../03-features/SafariCustomActions.md)
> **Depends on**: Opening Outcomes (built), Condition system (built)

---

## 1. Problem Statement

Hosts need probability-based gameplay mechanics — dice rolls, random events, chance-based outcomes. Currently, the condition system only evaluates deterministic checks (has item, has currency, has role). There's no way to say "75% chance of passing."

The existing Tycoons challenge has hardcoded probability (`calculateRoundProbability()`) with Good/Bad event types. This needs to be decoupled into a configurable condition type that any Action can use.

---

## 2. Feature: 🎲 Random Probability Condition

### What It Does

A new condition type added to the condition string select. When an action executes:
1. Opening Outcomes run (always)
2. Conditions evaluate — including Random Probability
3. If probability check passes → Pass Outcomes run
4. If probability check fails → Fail Outcomes run

### Interaction with Other Conditions

Random Probability evaluates **alongside** other conditions using the existing AND/OR logic:

**Example (AND logic):**
- Condition #1: Player must have `🗡️ Sword of 1000 Truths`
- Condition #2: 75% chance of pass

Result: Player MUST have the sword AND win the 75% roll. Missing the sword = always fail. Having the sword = 75% chance of pass, 25% chance of fail.

**Example (OR logic):**
- Condition #1: Player has role `VIP`
- Condition #2: 50% chance of pass

Result: VIPs always pass. Non-VIPs get a 50/50 shot.

---

## 3. UI — Condition Configuration Screen

When `🎲 Random Probability` is selected from `condition_type_select_*`:

```
## 🎲 Random Probability Configuration
───────────────────

When the ⚡ Action is executed, randomise the chance of this
condition passing or failing.

If multiple different types of conditions are set, random
probability will evaluate alongside those conditions.

> __Example__
> Condition #1: Player must have `🗡️ Sword of 1000 Truths`
> Condition #2: Player has a 75% chance of a 🟢 Pass Outcome
> -# In the example above, the Fail Outcomes will always run if
> -# the player does not have the Sword of 1000 Truths.
> -# But even if the player has the item, they still have a 1 in 4
> -# shot of failing due to the random probability.

───────────────────

**Display Mode**
How should probability results be displayed?

[String Select: display_mode
  📊 Probability + Display Text
  📊 Display Text Only
  🎲 Probability Only (compact result card)
  🔇 Silent (no output, logged only)
]

───────────────────

Section: 🟢 Probability of Pass Outcome
  "**🟢 Probability of Pass outcome**
   50% — 1 in 2 results will succeed"
  [Grey Button Accessory: 🟢 Set Probability → Modal]

📊 Pass Result Text
[richCard preview of pass result — title, description, image, accent]

───────────────────

Section: 🔴 Probability of Fail Outcome
  "**🔴 Probability of Fail outcome**
   50% — 1 in 2 results will fail"
  [Grey Button Accessory: 🔴 Set Probability → Modal]

📊 Fail Result Text
[richCard preview of fail result — title, description, image, accent]

───────────────────

[← Back to Action Editor]
```

### Set Probability Modal

```
Label: Pass Probability (%)
Description: Enter the chance of pass outcome (0-100). Fail is auto-calculated.
TextInput: style 1, placeholder "75", max_length 6
  Accepts: 75, 75%, 33.33, 33.33%, 0, 100

Label: Pass Result Title
TextInput: style 1, value "☀️ Good Fortune!"

Label: Pass Result Description
TextInput: style 2, value "The dice rolled in your favor..."

Label: Image URL (optional)
TextInput: style 1, placeholder "https://..."

Label: Accent Color (optional)
TextInput: style 1, placeholder "#4ade80"
```

On submit: auto-calculate fail % = 100 - pass %. UPDATE the parent message.

### Display Modes

| Mode | What Shows to Player |
|---|---|
| **Probability + Display Text** | Shows the dice roll result + the configured pass/fail richCard |
| **Display Text Only** | Shows only the configured pass/fail richCard (hides the roll) |
| **Probability Only** | Compact card: `🎲 Roll: 42.17% — Pass threshold: 75% — ❌ FAIL` |
| **Silent** | No output to player — result only in logs |

---

## 4. Data Model

### Condition Data

```javascript
// In action.conditions[]:
{
  type: 'random_probability',
  config: {
    passPercent: 75,              // 0-100, supports 2 decimal places
    displayMode: 'probability_text', // 'probability_text' | 'text_only' | 'probability_only' | 'silent'
    passResult: {
      title: '☀️ Good Fortune!',
      description: 'The dice rolled in your favor...',
      image: '',
      accentColor: 0x4ade80       // Green
    },
    failResult: {
      title: '🌧️ Bad Luck!',
      description: 'The odds were not in your favor...',
      image: '',
      accentColor: 0xe74c3c       // Red
    }
  }
}
```

### Last Roll Tracking

Store the last probability result on the action for downstream outcome use:

```javascript
// Written during condition evaluation, read by outcomes like calculate_results:
action._lastProbabilityRoll = {
  rolled: 42.17,                  // The actual random number (0-100)
  threshold: 75,                  // The configured pass %
  passed: false,                  // Whether it passed
  timestamp: Date.now()
};
```

This is ephemeral (in-memory during execution, not persisted). Outcomes like `calculate_results` can read `action._lastProbabilityRoll.passed` to determine Good/Bad event processing.

### Item Good/Bad Outcome Integration

Items have `goodOutcomeMultiplier` and `badOutcomeMultiplier` fields. When `calculate_results` runs after a probability condition:

```javascript
// In calculate_results handler:
const probabilityResult = action._lastProbabilityRoll;
if (probabilityResult) {
  // Use probability result to determine good/bad event
  const isGoodEvent = probabilityResult.passed;
  // Apply appropriate multiplier from items
  const multiplier = isGoodEvent ? item.goodOutcomeMultiplier : item.badOutcomeMultiplier;
}
```

This replaces the hardcoded `calculateRoundProbability()` in Tycoons.

---

## 5. Condition Evaluation Logic

```javascript
// In evaluateConditions():
case 'random_probability': {
  const passPercent = condition.config.passPercent ?? 50;
  const roll = Math.random() * 100; // 0-99.999...
  const passed = roll < passPercent;

  // Store for downstream outcomes
  action._lastProbabilityRoll = {
    rolled: Math.round(roll * 100) / 100, // 2 decimal places
    threshold: passPercent,
    passed,
    timestamp: Date.now()
  };

  // Generate display based on mode
  if (condition.config.displayMode !== 'silent') {
    const resultCard = passed ? condition.config.passResult : condition.config.failResult;
    // Queue display for after all conditions evaluate
    pendingDisplays.push({ mode: condition.config.displayMode, roll, passed, resultCard });
  }

  return passed;
}
```

---

## 6. Item Modal Label Updates

Update the Item entity edit modal fields to use Label components (type 18) with descriptions, and align terminology with the probability system:

| Current Field | New Label | New Description |
|---|---|---|
| Good Outcome Multiplier | 🟢 Pass Outcome Value | Multiplier applied when the probability condition passes (e.g., 1.5 = 150% earnings) |
| Bad Outcome Multiplier | 🔴 Fail Outcome Value | Multiplier applied when the probability condition fails (e.g., 0.5 = 50% earnings) |

Keep the data field IDs unchanged (`goodOutcomeMultiplier`, `badOutcomeMultiplier`) — only update the UI labels.

---

## 7. Implementation Phases

### Phase 1: Condition Type + UI

1. Add `random_probability` to `CONDITION_TYPES` in safariManager.js
2. Add `🎲 Random Probability` to condition type string select
3. Build configuration screen (probability display, pass/fail sections)
4. Set Probability modal with auto-calculate
5. Pass/Fail richCard configuration using richCardUI.js
6. Display mode string select

### Phase 2: Evaluation + Display

1. Add evaluation logic in `evaluateConditions()`
2. Store `_lastProbabilityRoll` on action during execution
3. Implement 4 display modes (probability+text, text-only, probability-only, silent)
4. Log all rolls regardless of display mode

### Phase 3: Integration

1. Wire `calculate_results` to read `_lastProbabilityRoll`
2. Replace hardcoded Tycoons probability with Random Probability condition
3. Update Item modal labels (Good/Bad → Pass/Fail Outcome Value)
4. Wrap Item modal fields in Label components per ComponentsV2.md

---

## 8. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Multiple probability conditions on one action | Low | Each evaluates independently. AND = all must pass. OR = any can pass |
| `_lastProbabilityRoll` overwritten by 2nd probability condition | Medium | Use array instead of single value, or store per-condition index |
| Floating point precision in % display | Low | Round to 2 decimal places |
| Silent mode with no other display | Low | Ensure at least one outcome has display_text if all conditions are silent |
| Item multiplier field rename confusion | Low | UI-only change, data fields unchanged |

---

## 9. Component Budget

Configuration screen estimate:
- Title text: 1
- Separator: 1
- Explanation text: 1
- Separator: 1
- Display mode text + select: 2 + 1 = 3
- Separator: 1
- Pass section + richCard preview: 2 + 1 + 1 = 4 (Section, preview text, optional image)
- Fail section + richCard preview: 4
- Separator + back button: 2
- **Total: ~18 components** — well within 40

---

## 10. Future Considerations

- **Weighted random outcomes** (not just pass/fail but multiple tiers: rare/uncommon/common)
- **Streak tracking** (3 fails in a row → guaranteed pass)
- **Per-player probability modifiers** (attributes affecting chance)
- **Probability history** (show last N rolls for a player)
