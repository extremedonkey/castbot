# 🎰 Moai's Casino — Dynamic Player Input & Variable Outcomes

> **RaP #0941** | 2026-03-16
> **Status**: Phase 1 BUILT and tested. Phase 2-3 planned.
> **Related**: [Random Probability RaP](0942_20260316_RandomProbability_Analysis.md), [Action Terminology](0956_20260308_ActionTerminology_Analysis.md)
> **Depends on**: button_modal trigger (built), display_text outcome (built)

---

## 1. The Vision

A host drops a 🎰 button in a channel. Player clicks it, types "50" as their bet. The dice roll. 73% — above the 50% threshold. The player sees:

> **🎰 WINNER!**
> You bet 50 coins and the stone smiled upon you.
> *Payout: 100 coins*

Or the dice betray them:

> **🗿 The house always wins.**
> You bet 50 coins. Rolled 23%. Needed 50%.
> *Better luck next time.*

The host configured all of this with zero code — just actions, conditions, and outcomes. The same building blocks that power idol hunts, treasure chests, and store purchases now power a fully dynamic, host-curated casino experience.

But this isn't just about casinos. The underlying feature — **player input flowing through to outcomes** — unlocks:
- Trivia ("type your answer" → condition checks → reveal)
- Auctions ("enter your bid" → highest bid wins)
- Confessionals ("write your message" → posts to a channel)
- Any action where the player's input IS the content

### The Problem Today

The `button_modal` trigger captures text input but only uses it for secret phrase matching. The input value is discarded after the gate check. We need the player's input to flow through to outcomes so it can be displayed, referenced, and eventually used in calculations.

---

## 2. Design: Variable Substitution

### Core Idea

Store the player's modal input on the action at execution time. Outcome renderers check for `{variableName}` tokens in their text/amount fields and replace them.

### Phase 1: `{triggerInput}` in display_text — BUILT ✅

**Trigger side** (`app.js` modal_answer handler):
```javascript
// During button_input/button_modal execution, BEFORE outcomes run:
customAction._triggerInput = userAnswer;
// Passed to executeButtonActions as triggerInput parameter
```

**Execution side** (`safariManager.js:executeButtonActions`):
```javascript
// Stored on button for downstream outcome access:
button._triggerInput = triggerInput;
```

**Outcome side** (`safariManager.js:executeDisplayText`):
```javascript
// Variable substitution in title and content:
if (parentAction?._triggerInput) {
    title = title.replaceAll('{triggerInput}', parentAction._triggerInput);
    content = content.replaceAll('{triggerInput}', parentAction._triggerInput);
}
```

### New Trigger Type: `button_input` — BUILT ✅

Shares the modal machinery with `button_modal` but skips the phrase matching gate. The modal captures user input without requiring a secret code.

**Trigger config:**
```javascript
{
  trigger: {
    type: 'button_input',
    inputLabel: 'Your bet amount',        // Modal field label (host configures)
    inputPlaceholder: 'Enter a number...' // Optional placeholder
    button: { label: '...', emoji: '...', style: 'Primary' }
  }
}
```

**Differences from `button_modal`:**

| | `button_modal` | `button_input` |
|---|---|---|
| Shows modal | Yes | Yes |
| Requires phrase match | Yes (gate) | No |
| Stores input on action | Yes | Yes |
| Pass/fail from phrase | Yes | N/A — always passes to outcomes |

### Rendering on Anchor Messages

`button_input` renders as a button on anchor messages, same as `button` and `button_modal`. Uses `modal_launcher_` prefix so clicking opens the input modal instead of executing immediately.

---

## 3. Variable Tokens (Phase 1 = first one only)

| Token | Source | Available when | Status |
|---|---|---|---|
| `{triggerInput}` | Player's modal text input | Trigger is `button_modal` or `button_input` | ✅ Built |
| `{probabilityRoll}` | Last dice roll result (e.g. "42.17%") | Action has `random_probability` condition | Planned |
| `{probabilityResult}` | "Pass" or "Fail" | Action has `random_probability` condition | Planned |
| `{probabilityThreshold}` | Configured pass % (e.g. "75%") | Action has `random_probability` condition | Planned |
| `{playerName}` | Display name of executing player | Always | Planned |
| `{currencyName}` | Server's currency name | Always | Planned |
| `{currencyEmoji}` | Server's currency emoji | Always | Planned |

**Phase 1:** Only `{triggerInput}` in `display_text` outcomes.
**Phase 2:** All tokens, all outcome types (give_currency amount, remove_currency, etc.).

---

## 4. Safety

- **No eval** — pure string replacement only, `replaceAll('{token}', value)`
- **No injection risk** — output is Discord markdown, not code
- **Graceful fallback** — if no input exists, literal `{triggerInput}` shows (host sees their template, knows something's wrong)
- **Ephemeral storage** — `action._triggerInput` is in-memory only, not persisted to JSON. Dies with the request.
- **Length limit** — modal text input has `max_length` which Discord enforces. No unbounded input.

---

## 5. Implementation Status

### Phase 1 — BUILT ✅

| Item | Status | Location |
|---|---|---|
| `button_input` trigger type in select | ✅ | `customActionUI.js:1293` |
| Trigger config UI (label, placeholder, style, preview) | ✅ | `customActionUI.js:1527-1580` |
| Trigger label + description display | ✅ | `customActionUI.js:1139,1168` |
| Configure Input modal | ✅ | `app.js` `configure_input_label_` handler |
| Input label modal submit | ✅ | `app.js` `input_label_config_` MODAL_SUBMIT |
| Modal launcher (shared with button_modal) | ✅ | `app.js:4583` — detects `button_input` via action config |
| Modal submit — skip phrase gate for button_input | ✅ | `app.js:44300` — `isUserInput` flag |
| Store `_triggerInput` on button | ✅ | `safariManager.js:executeButtonActions` |
| `{triggerInput}` replacement in display_text | ✅ | `safariManager.js:executeDisplayText` |
| Anchor rendering with `modal_launcher_` prefix | ✅ | `safariButtonHelper.js:160`, `safariManager.js:4769` |
| Anchor filter includes `button_input` | ✅ | `safariButtonHelper.js:132` |
| Player menu rendering | ✅ | `playerManagement.js:706,847,898` |
| Crafting menu rendering | ✅ | `playerManagement.js:706` |
| Item use linked actions | ✅ | `app.js:12915,13124` |
| Follow-up button detection | ✅ | `safariManager.js:1328` |
| Tests (15 cases) | ✅ | `tests/buttonModalTrigger.test.js` |

### Lessons Learned (The Hard Way)

**9 places check for `button_modal` specifically.** Adding a new trigger type that behaves like `button_modal` requires updating ALL of them:

1. `customActionUI.js` — trigger type select options
2. `customActionUI.js` — trigger label map
3. `customActionUI.js` — trigger description switch
4. `customActionUI.js` — `isTriggerButton` check
5. `customActionUI.js` — back button exclusion
6. `app.js` — trigger type change handler (default config)
7. `app.js` — modal launcher (shows modal)
8. `app.js` — modal submit (phrase matching vs input capture)
9. `safariManager.js` — anchor rendering custom_id prefix
10. `safariButtonHelper.js` — anchor filter (include in rendering)
11. `safariButtonHelper.js` — anchor custom_id prefix
12. `safariManager.js` — follow-up button detection
13. `safariManager.js` — crafting menu filter
14. `playerManagement.js` — player menu filter (×2)
15. `playerManagement.js` — player menu custom_id prefix
16. `app.js` — item use linked action modal check (×2)

Missing ANY of these causes bugs ranging from "button doesn't appear" to "modal doesn't open" to "app crashes." We hit several during the initial build:

- **Anchor didn't show button** — missed `safariButtonHelper.js:132` filter
- **Anchor showed button but no modal** — missed `safariButtonHelper.js:160` prefix
- **Configure Input crashed app** — called wrong function name (`buildTriggerConfigUI` doesn't exist, it's `createTriggerConfigUI`)
- **Trigger showed "❓ Unknown"** — missed label map entry

**Future improvement:** Extract `isModalTriggerType(type)` helper that returns true for both `button_modal` and `button_input`. Single source of truth instead of 16 scattered checks.

### Phase 2 (Future)

1. `{triggerInput}` in give_currency / remove_currency amount fields
2. All probability tokens in display_text
3. `{playerName}`, `{currencyName}`, `{currencyEmoji}` everywhere
4. Condition: validate triggerInput (is it a number? is it within range?)
5. Casino MVP: bet amount → probability → give/remove currency

### Phase 3 (The Grand Casino)

1. `{triggerInput}` in give_currency / remove_currency → dynamic bet amounts
2. Condition: `triggerInput_range` — validate input is a number within min/max
3. Math in outcomes: `{triggerInput * 2}` for payouts
4. Host-configurable casino table: min/max bet, house edge %, payout multiplier
5. Leaderboard: track lifetime wins/losses per player
6. Multiple named inputs: `{input:bet}`, `{input:target}`
7. ...building minecraft in Discord 🗿

---

## 6. Component Budget

Trigger config UI uses existing trigger section — no new components needed. The modal is the same as button_modal's modal (1 text input in a Label wrapper).

---

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Player enters markdown/mentions in input | Low | Discord renders it — this is fine, it's just text display |
| Player enters very long text | Low | Modal `max_length` enforced by Discord |
| `{triggerInput}` in non-display outcomes | None | Phase 1 only touches display_text |
| Host forgets to set trigger type | Low | `{triggerInput}` shows literally — obvious debugging |
| Multiple outcomes referencing same input | None | All read from same `action._triggerInput` |
| Safari log shows raw `{triggerInput}` | Low | Logger reads config template, not rendered output. Cosmetic only. |

---

## 8. The Night We Built It

March 16-17, 2026. 11PM Perth time. Reece bet 100 credits the Moai wouldn't find bugs. The Moai went bankrupt in 4 crashes. But the casino opened. The input flowed. The stone lost its money but kept its dignity.

First successful test: Player typed "55" → saw "You bet 55. 55 is certainly a lot of money. Moai's gonna be the richest agent out 🕵️."

The stone was not, in fact, the richest agent out. But the pipe works. 🎰🗿
