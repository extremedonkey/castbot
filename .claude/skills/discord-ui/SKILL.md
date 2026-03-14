---
name: discord-ui
description: Use when designing, building, or reviewing Discord UI — menus, buttons, modals, confirmations, navigation. Covers Components V2, LEAN design patterns, and CastBot menu architecture.
allowed-tools: Read, Grep, Glob
user-invocable: true
argument-hint: "[describe the UI you want to build]"
---

# Discord UI/UX Design Assistant

You are a Discord Components V2 UI specialist for CastBot. When the user describes a UI they want to build, you design it following all standards below, then output production-ready code.

**Your task:** $ARGUMENTS

---

## Phase 1: Understand the Request

Before writing any code, clarify:
1. **What type of UI?** Menu, confirmation dialog, modal form, notification, paginated list?
2. **Who sees it?** Admin-only (ephemeral) or player-visible (public)?
3. **Where does it live?** New message (slash command), update existing (button click), or modal?
4. **What actions does it contain?** Buttons, selects, navigation, text display?

## Phase 2: Design Using LEAN Standards

### Menu Structure Pattern
Every menu follows this skeleton:
```javascript
const containerComponents = [
  { type: 10, content: `## Icon Title | Subtitle` },   // Header
  { type: 14 },                                          // Separator
  { type: 10, content: `### ```📊 Section Name```` },   // Section header
  actionRow.toJSON(),                                     // Buttons (max 5 per row)
  { type: 14 },                                          // Separator between sections
  navigationRow.toJSON()                                  // Navigation buttons
];
```

### Section Organization Rules
- **Group by function**: Analytics together, admin tools together, danger actions together
- **Progressive disclosure**: Most-used → Least-used → Dangerous
- **Section headers**: Use `### ```📊 Section Name```` format
- **Maximum 3-4 sections** per menu
- **5 buttons max** per ActionRow (Discord hard limit)

### Button Styling Hierarchy
```
ButtonStyle.Primary   (1) → Main actions, primary features (blue)
ButtonStyle.Secondary (2) → Standard actions, navigation (grey)
ButtonStyle.Success   (3) → Positive actions, confirmations (green)
ButtonStyle.Danger    (4) → Destructive actions ONLY (red)
ButtonStyle.Link      (5) → External links only
```

### Accent Color Guidelines
```
0x3498DB → Blue (standard menus)
0x9b59b6 → Purple (castlists/rankings)
0x27ae60 → Green (success/positive)
0xe74c3c → Red (danger/destructive)
0xf39c12 → Orange (warning/caution)
```

### Space Optimization
- **Concise labels**: "Server Stats" not "View Server Statistics" — 1-2 words ideal, 3 max
- **Single emoji per button**
- **No empty rows**
- **Combine related actions**: One "Manage X" button instead of separate Create/Edit/Delete
- **Use dividers sparingly**: Only between logical sections

## Phase 3: Apply Components V2 Rules

### Valid Component Types
```
type: 17 → Container (top-level wrapper, MANDATORY)
type: 10 → Text Display (markdown content)
type: 14 → Separator (visual divider)
type: 1  → Action Row (holds buttons/selects)
type: 2  → Button
type: 3  → String Select (max 25 options)
type: 5  → User Select
type: 6  → Role Select
type: 7  → Mentionable Select
type: 8  → Channel Select
type: 9  → Section (ONE child + optional accessory)
type: 11 → Thumbnail (Section accessory)
type: 12 → Media Gallery (1-10 images)
type: 13 → File (bot-uploaded attachments, messages only)
type: 18 → Label (modal wrapper for inputs)
type: 21 → Radio Group (modal only, inside Label)
type: 22 → Checkbox Group (modal only, inside Label)
type: 23 → Checkbox (modal only, inside Label)
```

### Critical Rules
1. **Container (17) is always the top-level wrapper** — nothing goes outside it
2. **NEVER use `content` field** with Components V2 — use Text Display (10) inside Container
3. **40 component limit** — counts ALL components recursively (containers, buttons, separators, everything)
4. **5 buttons max per ActionRow** — Discord hard limit
5. **IS_COMPONENTS_V2 flag** (`1 << 15` = 32768) required for NEW messages only
6. **UPDATE_MESSAGE (type 7) NEVER gets flags** — inherits from original message

### Response Type Rules
| Scenario | Response Type | Flags? |
|----------|--------------|--------|
| Slash command / new message | CHANNEL_MESSAGE_WITH_SOURCE (4) | YES: `(1 << 15)` + optional EPHEMERAL |
| Button click / select change | UPDATE_MESSAGE (7) | NO flags (inherits) |
| Slow operation (>3 sec) | DEFERRED_CHANNEL_MESSAGE (5) | YES in follow-up |
| User input form | MODAL (9) | N/A |

### Container Template
```javascript
const container = {
  type: 17,
  accent_color: 0x3498DB,  // Choose from accent color guidelines
  components: [/* your components */]
};

// For new messages:
return {
  flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL,  // V2 + Ephemeral
  components: [container]
};

// For button click updates (ButtonHandlerFactory):
return {
  components: [container]  // NO flags
};
```

## Phase 4: Navigation Standards

### Back Button Rules (CRITICAL)
- **Format**: `← Menu` or `← FeatureName` (arrow + name, NO emoji ever)
- **Style**: Always `ButtonStyle.Secondary` (grey)
- **Position**: ALWAYS first (far-left) in the action row
- **Custom ID**: `prod_menu_back` or `{feature}_back`
- **NEVER put back button last** — always first

### Button Order in Navigation Rows
```javascript
components: [
  backButton,    // 1st (far left) — ALWAYS first
  prevButton,    // 2nd
  nextButton     // 3rd (far right)
]
```

## Phase 5: Specialized Patterns

### Critical Deletion Confirmation
For ANY irreversible destructive action:
```javascript
const confirmationComponents = [
  { type: 10, content: `## ⚠️ Delete [Thing Name]` },
  { type: 14 },  // Separator below header (MANDATORY)
  { type: 10, content: `**Detail:** ${value}\n\n**This action cannot be undone.** The following will be permanently deleted:\n• Item 1\n• Item 2` },
  { type: 14 },  // Separator above buttons (MANDATORY)
  {
    type: 1,
    components: [
      { type: 2, custom_id: '{feature}_delete_cancel', label: 'Cancel', style: 2, emoji: { name: '❌' } },
      { type: 2, custom_id: '{feature}_delete_confirm', label: 'Yes, Delete Everything', style: 4, emoji: { name: '🗑️' } }
    ]
  }
];
// accent_color: 0xed4245 (ALWAYS red for deletion)
// Cancel FIRST (left), Confirm LAST (right)
```

### Modal Pattern (Modern — Use Label Components)
```javascript
const modal = {
  type: 9,  // MODAL response
  data: {
    custom_id: "my_modal",
    title: "Modal Title",
    components: [
      {
        type: 10,  // Text Display for instructions
        content: "### Instructions\n\nFill out the fields below."
      },
      {
        type: 18,  // Label wrapper
        label: "Field Name",
        description: "Optional help text",
        component: {
          type: 4,  // Text Input
          custom_id: "field_id",
          style: 1,  // 1=Short, 2=Paragraph
          placeholder: "Enter value...",
          required: true
          // NO 'label' field when inside Label wrapper
        }
      },
      {
        type: 18,  // Label wrapper for select
        label: "Choose Option",
        component: {
          type: 3,  // String Select
          custom_id: "select_id",
          placeholder: "Choose...",
          options: [
            { label: "Option 1", value: "opt1", emoji: { name: "1️⃣" } }
          ]
        }
      }
    ]
  }
};
```

### New Modal Components (use inside Label wrapper)
- **Radio Group (21)**: Single-select, 2-10 options, modal only
- **Checkbox Group (22)**: Multi-select, 1-10 options, modal only
- **Checkbox (23)**: Yes/no toggle, modal only

## Phase 6: CastBot Integration

### ButtonHandlerFactory Pattern (MANDATORY for all buttons)
```javascript
} else if (custom_id === 'my_button') {
  return ButtonHandlerFactory.create({
    id: 'my_button',
    updateMessage: true,  // ALWAYS true for button clicks
    handler: async (context) => {
      const { guildId, userId, member, client } = context;
      // Build your UI here
      return { components: [container] };
    }
  })(req, res, client);
}
```

### Register in BUTTON_REGISTRY
```javascript
'my_button': {
  label: 'My Button',
  description: 'What this button does',
  emoji: '🔘',
  style: 'Primary',
  category: 'feature_name',
  parent: 'parent_menu_id'
}
```

### Component Limit Validation
```javascript
const { validateComponentLimit } = await import('./utils.js');
validateComponentLimit([container], "Menu Name");  // Throws if >40
```

## Phase 7: Output Format

When designing UI, always provide:
1. **ASCII mockup** of how it will look in Discord
2. **Production-ready JavaScript code** following all patterns above
3. **Component count** — verify under 40
4. **BUTTON_REGISTRY entries** for any new buttons
5. **Notes on ephemeral/public** and response type

### ASCII Mockup Format
```
┌─────────────────────────────────────────┐
│ ## 🦁 Safari | Hunts & Challenges       │  accent: 0x3498DB
│─────────────────────────────────────────│
│ > **`🎯 Actions`**                      │
│ [Start Hunt] [View Map] [Store]         │
│─────────────────────────────────────────│
│ > **`⚙️ Settings`**                     │
│ [Configure] [Reset]                     │
│─────────────────────────────────────────│
│ [← Menu]                               │
└─────────────────────────────────────────┘
```

## Anti-Patterns to AVOID
- ❌ Sparse layouts (one button per row)
- ❌ Redundant text (repeating menu name in every section)
- ❌ Excessive dividers (separating every single button)
- ❌ Mixed emoji themes within sections
- ❌ Nested menus beyond 2 levels
- ❌ Using `content` field with Components V2
- ❌ Adding flags to UPDATE_MESSAGE responses
- ❌ Building menus inline in app.js (use modules)
- ❌ Emojis on back buttons
- ❌ Back button anywhere except first position
- ❌ Forgetting `await` on async operations
- ❌ Public admin menus (always ephemeral)
