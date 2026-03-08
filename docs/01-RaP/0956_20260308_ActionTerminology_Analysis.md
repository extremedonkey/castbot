# 0956 — Action System Terminology Audit & Alignment Plan

**Date**: 2026-03-08
**Status**: Analysis complete, awaiting decision on low-hanging fruit
**Related**: [SafariCustomActions.md](../03-features/SafariCustomActions.md), [PlayerCommands.md](../03-features/PlayerCommands.md), [PlayerMenuActions.md](../03-features/PlayerMenuActions.md)

## Original Context

User wants to standardize terminology across the Action system. The current naming is inconsistent — the same concept has 3–6 different names depending on whether you're reading code, logs, docs, or Discord UI. The user's proposed model:

| Layer | Current Names (mixed) | Proposed Name |
|-------|----------------------|---------------|
| The top-level entity | Custom Action, Safari Button, Button, Interactive Action, Action | **Action** |
| What triggers it | Button Click, Text Command, Modal, Trigger Type, Codeword | **Trigger** |
| The steps it executes | Action Type, Sub-action, Action, Component | **Outcome** |

Key constraint: **No data schema changes** (too risky to transform `guildData.buttons{}` or `action.type`). Changes should be low-risk, low-effort, and primarily help AI agents and documentation consumers.

---

## 1. The Hierarchy

```
Action (top-level entity)
├── name, label, emoji, description
├── Trigger (how it's invoked)
│   ├── Button Click (trigger.type: 'button')
│   ├── Text Command (trigger.type: 'modal')
│   ├── Select Menu (trigger.type: 'select')
│   └── Scheduled (trigger.type: 'schedule')
├── Conditions (gates execution)
│   ├── Currency, Item, Role, Attribute checks
│   └── Logic: AND / OR
└── Outcomes (what happens — stored as actions[])
    ├── ✅ Execute if Conditions Met (executeOn: 'true')
    └── ❌ Execute if Conditions Not Met (executeOn: 'false')
        Each outcome has a type:
        ├── display_text
        ├── give_item / give_currency / update_currency
        ├── give_role / remove_role
        ├── modify_attribute
        ├── follow_up_button (chains to another Action)
        ├── calculate_results / calculate_attack
        ├── conditional / random_outcome
        ├── apply_regeneration / apply_cooldown
        └── move_player
```

**Data schema** (unchanged — this is what exists):
```javascript
safariData[guildId].buttons[actionId] = {
  name: "Harvest and Attack test",
  label: "Harvest and Attack test",
  trigger: { type: 'button', button: { label, emoji, style } },
  conditions: [{ type, config }],
  actions: [                          // ← "outcomes" conceptually
    { type: 'calculate_results', config: {...}, executeOn: 'true' },
    { type: 'give_item', config: {...}, executeOn: 'true' }
  ],
  coordinates: ["B3"],
  menuVisibility: 'none'
}
```

---

## 2. Current Terminology Map — Where Each Name Is Used

### 2.1 The Top-Level Entity (proposed: **Action**)

| Term Used | Where | Files/Locations |
|-----------|-------|----------------|
| **"Custom Action"** | UI headings, docs, user-facing | customActionUI.js (headers), SafariCustomActions.md, PlayerCommands.md |
| **"button"** | Variable names, storage key | `guildData.buttons[id]`, `buttonId` variable everywhere |
| **"Safari Button"** | Entity type, analytics | entityManager.js (`'safari_button'`), safariLogger.js, analyticsLogger.js |
| **"Interactive Action"** | One UI description | customActionUI.js:39 ("Design a new interactive action") |
| **"Action"** | Log messages, shorthand | console.log throughout app.js ("showing action editor for...") |
| **"Location Action"** | One doc reference | Safari.md:2080 ("formerly 'Safari Buttons', now 'Location Actions'") |

**Custom ID patterns using old names:**
- `entity_custom_action_*` — entity framework handlers
- `safari_button_*` — button management
- `custom_action_editor_*` — back navigation
- `safari_finish_button_*` — exit editor

### 2.2 The Trigger (proposed: **Trigger**)

| Term Used | Where | Files/Locations |
|-----------|-------|----------------|
| **"Trigger Type"** | UI section header | customActionUI.js:385 ("**Trigger Type**") |
| **"Button Click"** | Trigger option label | customActionUI.js:959 ("🖱️ Button Click") |
| **"Text Command"** | Trigger option label | customActionUI.js:960 ("⌨️ Text Command") |
| **"Modal"** | Code/data value | `trigger.type: 'modal'` (overloaded — also means Discord modal UI) |
| **"Player Command"** | Feature name, docs | PlayerCommands.md, custom_id `player_command_modal_*` |
| **"Codeword"** | Informal/legacy | Mentioned in conversation, not found in current docs |
| **"Phrases"** | Data field | `trigger.modal.keywords` array (also called "keywords" in code) |
| **"Scheduled Action"** | Trigger option | customActionUI.js:963 ("⏰ Scheduled Action") |

**Inconsistencies:**
- `trigger.modal.keywords` — field called "keywords" but UI says "Configure Phrases"
- "Modal" means both "the Discord popup form" and "text command trigger type"
- "Player Command" (docs/feature) vs "Text Command" (UI label) vs "Modal" (code)

### 2.3 The Outcomes (proposed: **Outcome**)

| Term Used | Where | Files/Locations |
|-----------|-------|----------------|
| **"Action Type"** | Select menu, docs | customActionUI.js:469 select options, SafariCustomActions.md headers |
| **"action"** | Variable name, array | `button.actions[]`, `action.type`, `action.config` |
| **"Sub-action"** | Some docs | CloneAction.md, ItemTriggeredActions.md |
| **"Action Component"** | One doc reference | EntityEditFramework.md ("Add Action Components") |
| **"Actions executed if..."** | UI section header | customActionUI.js:439 ("✅ Actions executed if Conditions Met") |

**Custom ID patterns:**
- `safari_action_type_select_*` — choosing outcome type to add
- `safari_add_action_*` — adding an outcome
- `safari_remove_action_*` — removing an outcome
- `safari_edit_action_*` — editing an outcome

**The core confusion:** "Action" is used for both the top-level entity AND the individual outcome steps. In logs:
- `"showing action editor for harvest_and_attack_test..."` → Action = entity (correct)
- ~~`"Added give_item action"` → Action = outcome step~~ → **FIXED**: now `"Added give_item outcome"`
- ~~`"Selected action type: give_item for button: harvest_and..."` → "action type" = outcome type, "button" = entity~~ → **FIXED**: now `"Selected outcome type: give_item for action: harvest_and..."`

### 2.4 Configuration Constants

| Constant | Current Name | File |
|----------|-------------|------|
| `MAX_ACTIONS_PER_BUTTON` | mixes "actions" + "button" | config/safariLimits.js |
| `MAX_BUTTONS_PER_GUILD` | uses "buttons" for entities | config/safariLimits.js |
| `MAX_BUTTON_LABEL_LENGTH` | uses "button" for entity | config/safariLimits.js |
| `executeButtonActions()` | mixes "button" + "actions" | safariManager.js |
| `createDefaultAction()` | "action" = entity | customActionUI.js |
| `getActionSummary()` | "action" = outcome | customActionUI.js |
| `logSafariButton()` | "safari button" | safariLogger.js |
| `logCustomAction()` | "custom action" | safariLogger.js |

### 2.5 User-Facing UI Strings (What Players/Admins See)

**Headings:**
- `"⚡ Action Editor | {name}"` — ✅ already says "Action" not "Custom Action"
- `"⚡ Actions for {coordinate}"` — ✅ already stripped "Custom"
- `"➕ Create New Custom Action"` — ❌ still says "Custom Action"
- `"🚀 Trigger Configuration"` — ✅ uses "Trigger"

**Section labels in editor:**
- `"✅ Actions executed if Conditions Met (4/5)"` — uses "Actions" for outcomes
- `"❌ Actions executed if Conditions Not Met (0/5)"` — same
- `"Action Info"` — button to edit entity name (ambiguous)

**Select menu options (outcome types):**
- Display Text, Give / Remove Currency, Give / Remove Item, Give Role, Remove Role, Modify Attribute, Follow-up Action, Calculate Results, Calculate Attack

**Modal titles:**
- `"Edit Action Info"` — editing the entity, but "Action" is ambiguous

**Action summary labels (shown in editor list):**
- `"1. Calculate Results All Players"` — no prefix indicating this is an "outcome"
- `"2. Give Item Nurturer x1 (once per player)"` — same

---

## 3. Issues Identified

### 3.1 Critical Ambiguity
**"Action" means two different things** depending on context — this is the #1 source of confusion for both humans and AI agents. When a developer or CC reads "action" in code, they must infer from context whether it means the top-level entity or an individual outcome step.

### 3.2 Legacy Naming in Storage
The storage key `guildData.buttons` and entity type `safari_button` refer to the top-level entity, but the system hasn't been "buttons-only" for a long time. Text commands, select menus, and scheduled triggers all live under `.buttons{}`.

### 3.3 "Modal" Overload
`trigger.type: 'modal'` means "text command" but "modal" in Discord API means "popup form". This creates confusion when reading code that handles both concepts.

### 3.4 False Positive Legacy Warnings
The `[🪨 LEGACY]` debug indicators fire for wildcard custom_id patterns like `safari_action_type_select_*` even when they ARE using ButtonHandlerFactory. These need adding to the `dynamicPatterns` array.

### 3.5 Inconsistent Constant Names
`MAX_ACTIONS_PER_BUTTON` mixes outcome terminology ("actions") with entity terminology ("button"). `executeButtonActions()` does the same.

---

## 4. Low-Hanging Fruit Recommendations

**Criteria applied:** No data schema changes, no functional risk, minimal regression surface.

### Tier 1 — Documentation & Comments Only (Zero Risk)

| # | Change | Files | Effort |
|---|--------|-------|--------|
| 1a | Add a **terminology glossary** to SafariCustomActions.md header defining Action, Trigger, Outcome | SafariCustomActions.md | 10 min |
| 1b | Update doc headers/body to use "Action" instead of "Custom Action" where already partially done | SafariCustomActions.md, PlayerCommands.md, PlayerMenuActions.md | 20 min |
| 1c | Add inline comments in code where "button" means "action entity" and "action" means "outcome" | app.js, safariManager.js, customActionUI.js | 15 min |
| 1d | Update CLAUDE.md Feature Documentation Index to use "Actions" not "Custom Actions" | CLAUDE.md | 5 min |

### Tier 2 — Log Messages & Debug Strings (Very Low Risk)

| # | Change | Files | Effort |
|---|--------|-------|--------|
| 2a | Change log messages to use consistent terms: "action" for entity, "outcome" for step | app.js handler sections, safariManager.js | 30 min |
| 2b | Fix `[🪨 LEGACY]` false positives — add `safari_action_type_select`, `safari_give_item_select`, `safari_item_save` to `dynamicPatterns` | app.js (~line 3771) | 5 min |
| 2c | Rename log prefix `logSafariButton()` calls to clarify they log action execution | safariLogger.js (callers only, not function signature) | 10 min |

### Tier 3 — UI String Changes (Low Risk, User-Visible)

| # | Change | Files | Effort |
|---|--------|-------|--------|
| 3a | Change `"➕ Create New Custom Action"` → `"➕ Create New Action"` | customActionUI.js:37 | 2 min |
| 3b | Change `"Design a new interactive action"` → `"Design a new action for players"` | customActionUI.js:39 | 2 min |
| 3c | Change `"Search through all custom actions"` → `"Search through all actions"` | customActionUI.js | 2 min |
| 3d | Change section `"✅ Actions executed if Conditions Met"` → `"✅ Outcomes if Conditions Met"` | customActionUI.js:439 | 2 min |
| 3e | Change section `"❌ Actions executed if Conditions Not Met"` → `"❌ Outcomes if Conditions Not Met"` | customActionUI.js:450,455 | 2 min |
| 3f | Change `"Edit Action Info"` modal title → `"Edit Action"` (clearer, shorter) | app.js:25321 | 2 min |
| 3g | Rename select menu placeholder from action type language to outcome language | customActionUI.js (select placeholder) | 5 min |

### Tier 4 — Variable/Function Renames (Low Risk but Broader)

| # | Change | Files | Effort |
|---|--------|-------|--------|
| 4a | Add alias constants: `MAX_OUTCOMES_PER_ACTION = MAX_ACTIONS_PER_BUTTON` | config/safariLimits.js | 5 min |
| 4b | Add comment headers to major code sections clarifying terminology | app.js custom action handler sections | 15 min |

### NOT Recommended (Too Risky / Too Much Effort)

| Change | Why Not |
|--------|---------|
| Rename `guildData.buttons` → `guildData.actions` | Data schema change — requires migration |
| Rename `button.actions[]` → `button.outcomes[]` | Data schema change — breaks all readers |
| Rename entity type `safari_button` → `action` | Breaks entityManager routing |
| Rename `executeButtonActions()` | Called from 10+ locations, high regression risk |
| Change `trigger.type: 'modal'` → `'text_command'` | Data schema change |
| Rename `buttonId` variable everywhere | 100+ references, high regression risk |

---

## 5. Documents Where This Content Could Merge

| Target Document | What to Merge | Notes |
|----------------|---------------|-------|
| **SafariCustomActions.md** | Terminology glossary (§1a), hierarchy diagram | This is the authoritative doc — add a "Terminology" section at top |
| **CLAUDE.md** | Update Feature Index labels, add brief terminology note | Helps future CC instances immediately |
| **PlayerCommands.md** | Align "Text Command" / "Player Command" terminology | Currently uses both |
| **PlayerMenuActions.md** | Minor term alignment | Already mostly consistent |
| **ButtonHandlerRegistry.md** | Update category name from "Custom Actions System" if desired | Low priority |
| **SafariProgress.md** | Fix inconsistent capitalization of "custom actions" | Minor cleanup |

---

## 6. Summary for AI Agents (Zero-Context Handoff)

**If you're a Claude Code instance picking this up:**

The CastBot "Custom Actions" system has a naming problem. Here's what you need to know:

1. **Action** = the top-level entity (e.g., `harvest_and_attack_test_1772798001927`). Stored in `safariData[guildId].buttons[id]`. Yes, the storage key says "buttons" — that's legacy and won't change.

2. **Trigger** = how the Action is invoked. Stored in `action.trigger.type`. Values: `'button'`, `'modal'` (means text command), `'select'`, `'schedule'`.

3. **Outcome** = an individual step the Action executes. Stored in `action.actions[]` array. Each has a `.type` (like `'give_item'`, `'display_text'`) and `.config`. The array field is called `actions` not `outcomes` — that's also legacy.

4. **When you see "button" in code**, it usually means the Action entity, not a Discord button component. When you see "action" in code, check context — it could mean either the entity OR an outcome.

5. **The user prefers**: "Action" (not "Custom Action"), "Trigger" (not "Button Click/Modal"), "Outcome" (not "Action Type/Sub-action").

6. **Don't change**: data schema keys (`buttons`, `actions[]`, `trigger.type` values), function signatures, entity type strings. **Do change**: UI strings, log messages, docs, comments.
