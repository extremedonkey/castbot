# Player Commands

## Overview

**Player Commands** is a text-based interaction system that lets players trigger Actions by typing phrases. It powers Easter eggs, puzzles, secret codes, idol hunt mechanics, and interactive story moments.

Players access commands through the **🕹️ Command** button on anchor messages, the **🕹️ Enter Command** button in Location Actions, or the **🕹️ Commands** button in `/menu`.

**Terminology**: See [Action Terminology](../01-RaP/0956_20260308_ActionTerminology_Analysis.md) — an "Action" is the top-level entity, a "Trigger" is how it's invoked, and "Outcomes" are the steps it executes.

---

## Entry Points

Players can enter commands through **four paths**, all sharing the same modal and matching logic:

| Entry Point | custom_id | Where | Scope |
|-------------|-----------|-------|-------|
| **Anchor message** | `player_enter_command_{coord}` | 🕹️ Command button on every map anchor | Location + global |
| **Location Actions** | `player_enter_command_{coord}` | Explore → Enter Command | Location + global |
| **Player Menu** | `player_enter_command_global` | `/menu` → Commands | Auto-detect location + global |
| **Admin Test** | `admin_test_command_{coord}` | Location Actions (admin) → Test Command | Location + global |

All entry points call `buildCommandModal()` from `commandUI.js`, which is the single source of truth for the modal UI.

---

## Command Prefixes

Prefixes are per-guild action verbs (e.g., climb, inspect, open) that appear as a **String Select** in the Command modal when configured. They help players discover what actions are available without guessing.

### How Prefixes Work

1. **Admin configures prefixes**: Settings → ❗ Commands → Add Prefix (label, emoji, description)
2. **Player opens Command modal**: If prefixes exist, sees a dropdown (♾️ Freeform default + prefixes)
3. **Player selects prefix + types target**: e.g., "🧗 climb" + "tree"
4. **System concatenates**: `"climb" + " " + "tree"` → `"climb tree"`
5. **Phrase matching**: `"climb tree"` matched against action's `trigger.phrases[]`

If no prefixes are configured, the modal shows only the text input (backwards compatible).

### Data Model

```javascript
// Per-guild prefix configuration
safariConfig.commandPrefixes: [
  { label: "climb", emoji: "🧗", description: "Climb something at this location" },
  { label: "inspect", emoji: "🔍", description: "Take a closer look at something" },
  { label: "open", emoji: "📦" }
]
```

**Limits**: `MAX_COMMAND_PREFIXES = 8` (in `config/safariLimits.js`)

### Prefix + Phrase Relationship

Prefixes are a **UI convenience** — they're baked into the stored phrase string. The action's `trigger.phrases` stores `"climb tree"`, not `{ prefix: "climb", target: "tree" }`. This means:
- Deleting a prefix doesn't break existing phrases
- Players can type `"climb tree"` freeform and it still matches
- Prefix detection for display is done at render time by matching against guild prefixes

---

## Phrase Configuration (Admin)

Admins configure phrases through the Action Editor → Trigger → 🕹️ Command.

### Trigger Configuration UI

```
🚀 Trigger Configuration | ⚡ Action Name
[Trigger Type: 🕹️ Command]
━━━━━━━━━━━━━━━━━━━━━━━━
🕹️ Command Phrases (3/8)
Player types a command phrase via the 🕹️ Enter Command button...
━━━━━━━━━━━━━━━━━━━━━━━━
🧗 climb `tree`              [Remove]
🔍 inspect `rock`            [Remove]
♾️ `my-secret-idol`           [Remove]
━━━━━━━━━━━━━━━━━━━━━━━━
[⚡ Actions]  [🕹️ Add Phrase]
```

- Each phrase is a Section (type 9) with a Remove button accessory
- Phrases with a matching prefix show the prefix emoji; freeform phrases show ♾️
- **Limit**: `MAX_PHRASES_PER_ACTION = 8` (in `config/safariLimits.js`)
- All phrases are **normalized to lowercase on save**

### Add Phrase Modal

The "Add Phrase" modal includes:
1. **Prefix select** (Label-wrapped String Select): Freeform default + guild prefixes with descriptions
2. **Command Phrase** (Label-wrapped Text Input): The word/phrase the player types

On submit: if prefix selected, concatenates `prefix + " " + phrase`; if freeform, saves phrase as-is.

---

## Command Resolution Flow

```
Player types command
│
├─ At a map location?
│   ├─ Tier 1: Search location actions for phrase match
│   │   └─ Match → executeButtonActions() → done
│   ├─ Tier 2: Search global actions (coordinates = [])
│   │   └─ Match → executeButtonActions() → done
│   └─ No match → "Nothing happened"
│
└─ Not at a map location?
    ├─ Tier 2: Search global actions only
    │   └─ Match → executeButtonActions() → done
    └─ No match → "Nothing happened"
```

### Global Button Location Detection

When a player uses the `/menu` → Commands button (`player_enter_command_global`), the system auto-detects location from `channel_id`:

```javascript
if (coord === 'global') {
  for (const [coordKey, coordData] of Object.entries(coordinates)) {
    if (coordData.channelId === channelId) {
      actualLocation = coordKey; // Player is in a map channel
      break;
    }
  }
}
```

If the channel matches a map coordinate, location-specific actions are searched first. If not, only global actions are searched.

### Phrase Matching

- **Case-insensitive exact match**: `phrase.toLowerCase() === command.toLowerCase()`
- **No fuzzy matching**: `"hello world"` does not match `"hello"`
- **Whitespace trimmed** before comparison

---

## Execution Logic

Once a phrase matches, execution follows a strict nested-if model. See [Action Terminology § Command Execution Logic](../01-RaP/0956_20260308_ActionTerminology_Analysis.md#6-command-text-trigger-execution-logic) for the full logic tree.

```
if phrase matches an action:
    execute Opening Outcomes       ← executeOn: 'always'
    evaluate Conditions            ← currency/item/role/attribute checks
    if conditions pass:
        execute Pass Outcomes      ← executeOn: 'true'
    else:
        execute Fail Outcomes      ← executeOn: 'false'
else:
    "Nothing happened"             ← no action entered, no outcomes fire
```

**Key principle**: The trigger phrase is a gate, not a condition. Fail Outcomes only fire when the phrase matched but conditions didn't — never for unmatched input.

---

## Configuration: Enabling/Disabling

### Global Commands Button

Controls whether the 🕹️ Commands button appears in player `/menu`.

**Setting**: `/menu` (admin) → Settings → Player Menu → "Enable Global Commands"

- **Yes** (default): Button appears in player menu
- **No**: Button hidden from player menu; location-specific buttons unaffected

### Anchor Message Button

The 🕹️ Command button on anchor messages is **always present** — not gated by `enableGlobalCommands`. Text command Actions are already gated by phrase matching.

---

## Data Storage

### Action Trigger

```javascript
safariData[guildId].buttons[actionId] = {
  trigger: {
    type: "modal",                              // Text command trigger
    phrases: ["climb tree", "inspect rock"]     // Case-insensitive match targets
  },
  actions: [
    { type: "display_text", executeOn: "always", config: {...} },  // Opening
    { type: "give_item",    executeOn: "true",   config: {...} },  // Pass
    { type: "display_text", executeOn: "false",  config: {...} }   // Fail
  ],
  coordinates: ["E7"],                          // Location assignment
  // ...
}
```

### Prefix Configuration

```javascript
safariData[guildId].safariConfig.commandPrefixes = [
  { label: "climb", emoji: "🧗", description: "Climb something at this location" }
]
```

---

## Key Technical Details

### Component Budget (Anchor Messages)

Anchor messages have a 40-component Discord limit. The anchor builder (`safariButtonHelper.js`) calculates a button budget: fixed components (fog map, title, nav row) are counted first, then dynamic buttons (stores, drops, action buttons) are capped to fit. A `⚠️` warning is logged if truncation occurs.

### Deferred Response Pattern

Command submission uses deferred responses to avoid Discord's 3-second timeout:

```javascript
await res.send({
  type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  data: { flags: InteractionResponseFlags.EPHEMERAL }
});
// ... expensive operations ...
await DiscordRequest(`webhooks/${appId}/${token}/messages/@original`, {
  method: 'PATCH', body: result
});
```

### Modal UI Source of Truth

`buildCommandModal()` in `commandUI.js` is the single builder for all Command modals. It conditionally includes the prefix String Select based on whether the guild has prefixes configured.

---

## Code Locations

### UI Builders (commandUI.js)

| Function | Purpose |
|----------|---------|
| `buildCommandModal()` | Player/admin Enter Command modal (with conditional prefix select) |
| `buildCommandPrefixesUI()` | Admin prefix management screen |
| `buildAddPrefixModal()` | Admin Add Prefix modal |
| `buildAddPhraseModal()` | Admin Add Phrase modal (with prefix select) |
| `addCommandPrefix()` | Add prefix to guild config |
| `removeCommandPrefix()` | Remove prefix from guild config |
| `addActionPhrase()` | Add phrase to action trigger |
| `removeActionPhrase()` | Remove phrase from action trigger |
| `detectPhrasePrefix()` | Match phrase against guild prefixes for display |

### Handlers (app.js)

| Handler | custom_id | Section |
|---------|-----------|---------|
| Player global command | `player_enter_command_global` | MESSAGE_COMPONENT |
| Player location command | `player_enter_command_{coord}` | MESSAGE_COMPONENT |
| Admin test command | `admin_test_command_{coord}` | MESSAGE_COMPONENT |
| Add phrase button | `action_phrase_add_{actionId}` | MESSAGE_COMPONENT |
| Remove phrase button | `action_phrase_remove_{actionId}_{index}` | MESSAGE_COMPONENT |
| Player modal submit | `player_command_modal_{coord}` | MODAL_SUBMIT |
| Admin modal submit | `admin_command_modal_{coord}` | MODAL_SUBMIT |
| Add phrase modal submit | `action_phrase_add_modal_{actionId}` | MODAL_SUBMIT |
| Prefix management | `command_prefixes_menu` | MESSAGE_COMPONENT |
| Add prefix | `command_prefix_add` | MESSAGE_COMPONENT |
| Remove prefix | `command_prefix_remove_{index}` | MESSAGE_COMPONENT |
| Add prefix modal submit | `command_prefix_add_modal` | MODAL_SUBMIT |

### Limits (config/safariLimits.js)

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_COMMAND_PREFIXES` | 8 | Max prefixes per guild |
| `MAX_PHRASES_PER_ACTION` | 8 | Max phrases per action trigger |

---

## Related Documentation

- **[SafariCustomActions.md](SafariCustomActions.md)** — Complete Actions reference (outcome types, conditions, usage limits)
- **[Action Terminology](../01-RaP/0956_20260308_ActionTerminology_Analysis.md)** — Naming conventions and execution logic tree
- **[Command Prefixes RaP](../01-RaP/0921_20260411_CommandPrefixes_Analysis.md)** — Design analysis and implementation history
- **[ComponentsV2.md](../standards/ComponentsV2.md)** — Discord component types (Label, String Select, etc.)
- **[ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md)** — Handler registration patterns
