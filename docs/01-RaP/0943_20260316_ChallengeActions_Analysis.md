# Challenge ↔ Action Integration — Playable Challenges

> **RaP #0943** | 2026-03-16
> **Status**: Specification — design complete
> **Related**: [Challenges RaP](0945_20260316_Challenges_Analysis.md), [Challenge Library RaP](0944_20260316_ChallengeLibrary_Analysis.md), [Action Terminology](0956_20260308_ActionTerminology_Analysis.md), [SafariCustomActions](../03-features/SafariCustomActions.md), [PlayerCommands](../03-features/PlayerCommands.md)

---

## 1. Vision

Transform challenges from **content cards** (title + description + image) into **playable experiences** by linking Custom Actions to challenges. Players interact with challenges through buttons and text commands, and the Actions Engine handles all the game logic.

This is the bridge between Season Planner (scheduling) → Challenges (content) → Actions (gameplay).

---

## 2. How Actions Work Today

### Action Execution Flow

```
Player triggers action (button click / !command / select / schedule)
  ↓
1. IDENTIFY: Look up action from safariData[guildId].buttons[actionId]
2. CHECK CONDITIONS: Evaluate gates (currency, items, roles, attributes)
   → Result: TRUE or FALSE
3. FILTER OUTCOMES: Split action.actions[] by executeOn ('true' / 'false')
4. EXECUTE OUTCOMES: Run each matching outcome in sequence
5. RESPOND: Send combined results to player
```

### Outcome Types (what each step can do)

| Type | Effect | Example Use in Challenge |
|---|---|---|
| `display_text` | Shows message to player | Challenge instructions, round results |
| `give_item` | Adds items to inventory | Reward items for completing tasks |
| `give_currency` / `update_currency` | Modifies player currency | Tycoons earnings, challenge rewards |
| `give_role` / `remove_role` | Assigns/removes Discord role | Team assignment, immunity winner |
| `modify_attribute` | Changes player stats | Reduce stamina, increase score |
| `follow_up_button` | Chains to another Action | Multi-step challenges |
| `calculate_results` | Tycoons yield calculation | Economic challenge resolution |
| `calculate_attack` | Attack queue processing | PvP challenge mechanics |
| `conditional` | Nested if/else logic | "If player has item X, give bonus" |
| `random_outcome` | Weighted random selection | Dice rolls, event probability |
| `apply_regeneration` | Recurring stat recovery | Stamina regen between rounds |
| `apply_cooldown` | Prevent reuse for N time | One submission per round |
| `move_player` | Map movement | Exploration challenges |

### Key Insight

**Outcomes are stateless and self-contained.** The execution engine (`executeButtonActions()` in safariManager.js) doesn't care whether an action was triggered from a challenge, a map cell, or a standalone button. The same `give_currency` outcome works everywhere. This means:

- No new outcome types needed for basic challenge integration
- No execution engine changes needed
- Linking is purely a data association + UI layer

---

## 3. Data Model

### Challenge → Action Link

Add `actionIds` array to the challenge entity:

```javascript
// In playerData[guildId].challenges[challengeId]:
{
  title: "Tycoons of the Nile",
  description: "Build your trading empire...",
  // ... existing fields ...
  actionIds: ["fastmoney_133575", "attack_abc123"]  // Linked Custom Actions
}
```

This is a **many-to-many** relationship:
- One challenge can have multiple actions (e.g., "Buy Stocks" + "Attack" + "Check Balance")
- One action can be reused across multiple challenges (e.g., "Give Currency" works in any economic challenge)

### No Back-Pointer Needed

Actions don't need to know they're linked to a challenge. The challenge stores the forward reference. When displaying the challenge, look up linked actions from `safariData[guildId].buttons[actionId]`.

---

## 4. UI — Linking Actions to Challenges

### Challenge Screen — New "⚡ Actions" Button

Add to the challenge action row (alongside Edit, Round, Post to Channel, etc.):

```
✏️ Edit | 🔥 Round | ⚡ Actions | #️⃣ Post to Channel | 📤 Publish | 🗑️ Delete
```

### Action Selector

Click ⚡ Actions → shows a multi-select of existing Custom Actions:

```
## ⚡ Linked Actions
-# Select actions that players can use during this challenge

[String Select:
  🔍 Search Actions
  ───────────────────
  ✅ FASTMONEY (linked)
  ✅ Attack Player (linked)
  ▫️ Baby Item
  ▫️ Free Money
  ...
]

← Back to Challenge
```

Selecting a linked action unlinks it. Selecting an unlinked action links it. Toggle pattern.

### Challenge Detail — Show Linked Actions

When viewing a challenge with linked actions, show them:

```
# Tycoons of the Nile
Build your trading empire...

### ⚡ Actions (2 linked)
- 💴 FASTMONEY — Give currency based on round results
- ⚔️ Attack Player — Spend currency to attack another player

✏️ Edit | 🔥 Round | ⚡ Actions | ...
```

---

## 5. Player-Facing — Challenge with Action Buttons

### "Post to Channel" with Actions

When a host posts a challenge that has linked actions, the message includes the action buttons:

```
┌─────────────────────────────────────┐
│ # Tycoons of the Nile              │
│                                     │
│ Build your trading empire along     │
│ the Nile. Buy low, sell high, and   │
│ attack your competitors!            │
│                                     │
│ [image]                             │
│                                     │
│ [💴 Buy Stocks] [⚔️ Attack] [📊 Balance] │
│                                     │
│ -# Challenge by Reece               │
└─────────────────────────────────────┘
```

The action buttons use the standard Safari button pattern (`safari_{guildId}_{actionId}_{timestamp}`). When clicked, they go through the normal Action execution flow — conditions, outcomes, response.

### Player Commands

Actions with text command triggers (e.g., `!buy`, `!attack`) work in the challenge channel automatically. No additional wiring needed — Player Commands already listen globally. Future enhancement: scope commands to specific channels.

---

## 6. Challenge Library — Action Templates

When publishing to the Challenge Library, linked actions can be bundled as **action templates**:

```javascript
// In challengeLibrary.json template:
{
  title: "Tycoons of the Nile",
  // ... content fields ...
  actionTemplates: [
    {
      name: "Buy Stocks",
      trigger: { type: 'button', button: { label: 'Buy Stocks', emoji: '💴' } },
      conditions: [{ type: 'currency_check', config: { min: 10 } }],
      actions: [
        { type: 'update_currency', config: { amount: -10 }, executeOn: 'true' },
        { type: 'give_item', config: { itemId: 'stock_cert' }, executeOn: 'true' },
        { type: 'display_text', config: { text: 'Not enough currency!' }, executeOn: 'false' }
      ]
    }
  ]
}
```

On import:
1. Challenge content → new challenge entity
2. Action templates → new Custom Actions in the importing server
3. Auto-link the new actions to the new challenge

This is the "playable challenge template" — the killer feature for the community library.

---

## 7. Design Decisions (updated 2026-03-17)

### Button prefix: NOT `safari_`

Challenge actions are not map-bound. Using `safari_{guildId}_{actionId}` is technically functional (the execution engine doesn't care about prefix) but misleading in logs and couples challenges to the Safari feature namespace.

**Decision:** Use `challenge_{guildId}_{actionId}_{timestamp}` for challenge-posted action buttons. For modal triggers (`button_modal`, `button_input`), use `modal_launcher_{guildId}_{actionId}_{timestamp}` (already universal).

This also future-proofs for **custom anchors** — standalone interactive messages not tied to map coordinates. A challenge post with action buttons IS an anchor, just not a map one.

### Button over text command

The original spec referenced text commands (`?buy-lottery-ticket 3`). With `button_input` trigger type now built (RaP 0941), player input flows through buttons instead. Player clicks → types input → outcomes use `{triggerInput}`.

**Benefit:** No `MessageContent` privileged intent needed. Buttons work via interactions (webhook), text commands require gateway intent.

### Host vs Player action types (future)

Some actions are host-driven ("Start Challenge", "Reveal Results") and some are player-driven ("Buy Ticket", "Submit Answer"). For MVP, no distinction — all linked actions show as buttons. Future: `actionRole: 'host' | 'player' | 'both'` on the link, with player menu integration gating by challenge active status.

---

## 8. Implementation Phases

### Phase 1: Linking UI (MVP) — TONIGHT

1. Add `actionIds: []` to challenge data model
2. "⚡ Actions" button on challenge detail screen
3. Action selector (toggle-link from existing actions, search if >25)
4. Display linked actions count/names on challenge detail
5. "Post to Channel" includes linked action buttons with `challenge_` prefix

### Phase 2: Player Menu Integration

1. Challenge section in player `/menu` — shows current active challenge
2. String select for available challenge actions (only when challenge is active)
3. Challenge status: `active` / `paused` / `completed` — gates player action visibility
4. Host controls: activate/deactivate challenge from challenge detail screen

### Phase 3: Custom Anchors (Reusability)

1. Decouple "anchor message with action buttons" from map coordinates
2. Challenge posts, game lobby messages, event channels — all become "anchors"
3. Shared anchor rendering: `buildAnchorMessage(title, description, image, actionIds, guildId)`
4. Refresh mechanism for non-map anchors (same as `safari_refresh_anchors`)

### Phase 4: Action Templates in Library

1. Export action configs with published challenges
2. Import creates both challenge + actions
3. Template validation (referenced items/currency exist)
4. "Playable" badge on library challenges with action templates

### Phase 5: Advanced

1. Host vs Player action roles on links
2. Per-challenge leaderboard (aggregate player results)
3. `round_results` outcome — aggregate and display all players' round outcomes
4. `timed_action` — auto-execute after duration (replace schedule triggers)

---

## 8. What Already Works (No Changes Needed)

| Capability | Status | Notes |
|---|---|---|
| Action CRUD | ✅ | Full editor UI |
| 15+ outcome types | ✅ | Currency, items, roles, conditions, random, chain |
| Button triggers | ✅ | Posted to channels via anchor messages |
| Text command triggers | ✅ | Player Commands — `!command` in any channel |
| Condition gates | ✅ | Currency, item, role, attribute checks with AND/OR |
| Execution engine | ✅ | `executeButtonActions()` handles full pipeline |
| Logging | ✅ | Safari logger tracks all action execution |

---

## 10. Real-World Example: Hurley's Lotto Sweepstakes

A host wants to run a lottery challenge where players buy tickets and get random payouts.

**Today (manual, external tools):**
- Players type `?buy-lottery-ticket 3` in a channel
- External bot randomises payout
- Players manually track their money
- Host manually collects results

**With Challenge Actions (Phase 1 + existing features):**
1. Host creates challenge "Hurley's Lotto Sweepstakes" with writeup
2. Host creates Action "Buy Tickets" with:
   - Trigger: `button_input` (label: "How many tickets?")
   - Condition: `has_currency` (min: 100 × `{triggerInput}` — Phase 2)
   - Condition: `random_probability` (50% chance of payout)
   - Pass outcome: `display_text` ("Winner! You bought {triggerInput} tickets and won!")
   - Fail outcome: `display_text` ("Bad luck! {triggerInput} tickets, $0 payout")
3. Host links Action to Challenge
4. Host posts Challenge to channel → button appears
5. Players click, type number, get instant result — all tracked by CastBot

**Phase 1 limitation:** Currency amounts are fixed, not dynamic from `{triggerInput}`. Player self-reports earnings. Phase 2 adds `{triggerInput}` in give_currency for full automation.

---

## 11. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Action selector exceeds 25 items | Medium | Search option in selector, same pattern as challenges |
| Posting actions from wrong server context | Low | Actions are per-guild, buttons include guildId |
| Imported action templates reference missing items | Medium | Validation on import, skip missing references |
| Channel-scoped commands complexity | Low | Phase 2 — global commands work for MVP |
| Multiple challenges linking same action | None | By design — many-to-many is intentional |
