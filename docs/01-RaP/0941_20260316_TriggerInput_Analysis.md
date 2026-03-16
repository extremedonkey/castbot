# 🎰 Moai's Casino — Dynamic Player Input & Variable Outcomes

> **RaP #0941** | 2026-03-16
> **Status**: Ready to build (Phase 1 tonight)
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

### Phase 1 (Tonight): `{triggerInput}` in display_text

**Trigger side:**
```javascript
// During button_modal execution, BEFORE outcomes run:
action._triggerInput = modalValue;  // ephemeral, not persisted
```

**Outcome side (display_text only):**
```javascript
// In display_text rendering:
let text = outcome.text;
if (text && action._triggerInput) {
  text = text.replaceAll('{triggerInput}', action._triggerInput);
}
```

**Host configures:**
- Trigger: `button_modal` (or new `button_input` — see below)
- Outcome (display_text): `You said: **{triggerInput}**`
- Player types "hello" → sees "You said: **hello**"

### New Trigger Type: `button_input`

Shares the modal machinery with `button_modal` but skips the phrase matching gate. The modal captures user input without requiring a secret code.

**Trigger config:**
```javascript
{
  trigger: {
    type: 'button_input',
    inputLabel: 'Your bet amount',        // Modal field label (host configures)
    inputPlaceholder: 'Enter a number...' // Optional placeholder
  }
}
```

**Differences from `button_modal`:**

| | `button_modal` | `button_input` |
|---|---|---|
| Shows modal | Yes | Yes |
| Requires phrase match | Yes (gate) | No |
| Stores input on action | Phase 1: Yes | Phase 1: Yes |
| Pass/fail from phrase | Yes | N/A — always passes to outcomes |

**Implementation:** Extract shared modal-showing logic from `button_modal` handler. `button_input` calls the same function but skips `checkPhraseMatch()`.

### Rendering on Anchor Messages

`button_input` renders as a button on anchor messages, same as `button` and `button_modal`. Uses the action's configured label, emoji, style. Clicking opens the input modal instead of executing immediately.

---

## 3. Variable Tokens (Phase 1 = first one only)

| Token | Source | Available when |
|---|---|---|
| `{triggerInput}` | Player's modal text input | Trigger is `button_modal` or `button_input` |
| `{probabilityRoll}` | Last dice roll result (e.g. "42.17%") | Action has `random_probability` condition |
| `{probabilityResult}` | "Pass" or "Fail" | Action has `random_probability` condition |
| `{probabilityThreshold}` | Configured pass % (e.g. "75%") | Action has `random_probability` condition |
| `{playerName}` | Display name of executing player | Always |
| `{currencyName}` | Server's currency name | Always |
| `{currencyEmoji}` | Server's currency emoji | Always |

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

## 5. Implementation Plan

### Phase 1 (Tonight)

1. **New trigger type `button_input`** in trigger type select
2. **Shared modal logic** — extract from `button_modal` handler
3. **Store `action._triggerInput`** during execution
4. **`{triggerInput}` replacement** in display_text outcome rendering
5. **Tests** for string replacement logic

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
