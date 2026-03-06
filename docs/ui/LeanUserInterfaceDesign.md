# LEAN Menu Design Standards

**🎯 Philosophy**: Maximize information density while maintaining clarity and visual hierarchy

## ✅ Menu Structure Pattern
```javascript
// LEAN Menu Template - Copy this pattern for ALL menus
const containerComponents = [
  { type: 10, content: `## Menu Title | Key Features` },   // Header (e.g. "## 🦁 Safari | Idol Hunts, Challenges & More")
  { type: 14 },                                            // Separator
  { type: 10, content: `> **\`📊 Section Name\`**` },     // Section header
  actionRow1.toJSON(),                                     // Buttons (max 5)
  { type: 14 },                                            // Separator between sections
  { type: 10, content: `> **\`🔧 Next Section\`**` },     // Next section
  actionRow2.toJSON(),                                     // More buttons
  { type: 14 },                                            // Separator before navigation
  navigationRow.toJSON()                                   // Navigation buttons
];
```

## ✅ Section Organization Rules
- **Group by function**: Analytics together, admin tools together, danger actions together
- **Progressive disclosure**: Most-used → Least-used → Dangerous
- **Section headers**: Use `> **\`📊 Section Name\`**` format (backticks for emphasis)
- **Maximum 3-4 sections** per menu to prevent scrolling
- **5 buttons max** per ActionRow (Discord hard limit)
- **Button Grouping Patterns**:
  - CRUD operations together (View, Add, Edit, Delete)
  - Data operations together (Import, Export, Backup)
  - Navigation together (submenus, external links)

## ✅ Button Styling Hierarchy
```javascript
ButtonStyle.Primary   // Main actions, primary features, blue color
ButtonStyle.Secondary // Standard actions, navigation, grey color
ButtonStyle.Success   // Positive actions, confirmations, green color
ButtonStyle.Danger    // Destructive actions ONLY, red color
ButtonStyle.Link      // External links only
```

## ✅ Space Optimization Techniques
1. **Concise labels**: "Server Stats" not "View Server Statistics"
2. **Single emoji per button**: 📊 not 📊📈📉
3. **No empty rows**: Every ActionRow must have buttons
4. **Combine related actions**: One "Manage X" button instead of separate Create/Edit/Delete
5. **Use dividers sparingly**: Only between logical sections

## ✅ Visual Hierarchy
```
## Title                    // H2 for main title
> **`📊 Section`**         // Quoted, bold, backticked sections
Regular button text         // Standard button labels
-# Credit line             // Small text for credits/notes
```

## ✅ Container Configuration
```javascript
const menuContainer = {
  type: 17,                          // Container type (MANDATORY)
  accent_color: 0x3498DB,           // Blue for standard, 0xe74c3c for danger
  components: containerComponents   // Array of components
};

return {
  flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL,  // IS_COMPONENTS_V2 + Ephemeral (typical for menus)
  components: [menuContainer]
};
```

### Accent Color Guidelines
```javascript
0x3498DB  // Blue - Standard menus
0x9b59b6  // Purple - Castlists/rankings  
0x27ae60  // Green - Success/positive actions
0xe74c3c  // Red - Danger/destructive actions
0xf39c12  // Orange - Warning/caution
// Discord role color - When menu relates to specific role
```

## ❌ Anti-Patterns to Avoid
- **Sparse layouts**: Don't use one button per row unless necessary
- **Redundant text**: Don't repeat menu name in every section
- **Excessive dividers**: Don't separate every single button
- **Mixed metaphors**: Keep emoji themes consistent within sections
- **Nested menus beyond 2 levels**: Flatten navigation where possible

## 📏 Size Guidelines
- **Menu height**: Aim for 5-8 visible rows without scrolling
- **Button text**: 1-2 words ideal, 3 words maximum
- **Section headers**: 1-3 words with single emoji
- **Total components**: Stay under 40 components per container (Discord limit per ComponentsV2.md)
- **Component Budget**: With separators and text, typically ~20-25 usable slots

## 🔙 Navigation Standards
- **Back Button Format**:
  - **To Main Menu**: `← Menu` (arrow + "Menu", **NO emoji**)
  - **To Feature Menu**: `← Safari` (arrow + feature name, **NO emoji**)
  - Custom ID: `prod_menu_back` or `{feature}_back`
  - Style: Always `ButtonStyle.Secondary` (grey)
  - Position: **Far-left (FIRST position in action row)**, after separator
  - **CRITICAL**: Back buttons NEVER have emojis, regardless of destination

- **Button Order in Navigation Rows**:
  ```javascript
  // ✅ CORRECT: Back button FIRST (far left)
  components: [
    backButton,      // 1st position (far left)
    prevButton,      // 2nd position
    nextButton       // 3rd position (far right)
  ]

  // ❌ WRONG: Back button at end
  components: [
    prevButton,
    nextButton,
    backButton      // NEVER put back button last!
  ]
  ```

- **Examples**:
  ```javascript
  // Back to main production menu
  new ButtonBuilder()
    .setCustomId('prod_menu_back')
    .setLabel('← Menu')  // Arrow + Menu, NO emoji
    .setStyle(ButtonStyle.Secondary)

  // Back to Safari menu (2nd level)
  new ButtonBuilder()
    .setCustomId('prod_safari_menu')
    .setLabel('← Safari')  // Arrow + feature name, NO emoji
    .setStyle(ButtonStyle.Secondary)
    // NO .setEmoji() - back buttons never have emojis!

  // Tips gallery navigation (complete example)
  {
    type: 1, // Action Row
    components: [
      {
        type: 2, // Button - BACK FIRST (far left)
        custom_id: 'dm_back_to_welcome',
        label: '← Back',
        style: 2  // NO emoji!
      },
      {
        type: 2, // Button - Previous second
        custom_id: `tips_prev_${index}`,
        label: '◀ Previous',
        style: 2,
        disabled: index === 0
      },
      {
        type: 2, // Button - Next third
        custom_id: `tips_next_${index}`,
        label: 'Next ▶',
        style: 2,
        disabled: index === totalCount - 1
      }
    ]
  }
  ```

## 🎯 Example: Analytics Menu (Optimal LEAN Design)
```
## 📊 Analytics | Server Stats & Admin Tools
━━━━━━━━━━━━━━━━━━━━━━
> **`📊 Analytics`**
[Server List] [Print Logs] [Server Stats]
━━━━━━━━━━━━━━━━━━━━━━
> **`🔧 Admin Tools`**  
[Toggle Logs] [Test Roles] [Msg Test]
━━━━━━━━━━━━━━━━━━━━━━
> **`☢️ Danger Zone`**
[Nuke Roles] [Emergency Re-Init]
━━━━━━━━━━━━━━━━━━━━━━
[← Menu]
```
**Result**: 9 buttons + navigation in just 5 ActionRows with clear visual separation

---

## 🚨 Critical Deletion UI Standard

**Use this pattern for ANY irreversible destructive action** (map deletion, data wipes, bulk channel removal, etc.)

### Structure
```
┌─────────────────────────────────────────┐
│ ## ⚠️ [Action Title]                    │  ← H2 header with warning emoji
│─────────────────────────────────────────│  ← Separator
│ **Detail 1:** Value                     │  ← Impact summary (what will be affected)
│ **Detail 2:** Value                     │
│                                         │
│ **This action cannot be undone.**       │  ← Consequences block
│ The following will be permanently       │
│ deleted:                                │
│ • Item 1                                │
│ • Item 2                                │
│─────────────────────────────────────────│  ← Separator above buttons (MANDATORY)
│ [❌ Cancel]  [🗑️ Yes, Delete Everything]│  ← Cancel FIRST (left), Confirm LAST (right)
└─────────────────────────────────────────┘
  accent_color: 0xed4245 (Red)
```

### Template
```javascript
// Critical Deletion Confirmation - Copy this pattern
const confirmationComponents = [
  {
    type: 10, // Text Display - Header
    content: `## ⚠️ Delete [Thing Name]`
  },
  { type: 14 }, // Separator below header (MANDATORY)
  {
    type: 10, // Text Display - Details & Consequences
    content: `**Detail:** ${value}\n**Detail:** ${value}\n\n**This action cannot be undone.** The following will be permanently deleted:\n• Item 1\n• Item 2\n• Item 3`
  },
  { type: 14 }, // Separator above buttons (MANDATORY)
  {
    type: 1, // Action Row
    components: [
      {
        type: 2, // Cancel button - ALWAYS FIRST (left)
        custom_id: '{feature}_delete_cancel',
        label: 'Cancel',
        style: 2, // Secondary (grey)
        emoji: { name: '❌' }
      },
      {
        type: 2, // Confirm button - ALWAYS LAST (right)
        custom_id: '{feature}_delete_confirm',
        label: 'Yes, Delete Everything',
        style: 4, // Danger (red)
        emoji: { name: '🗑️' }
      }
    ]
  }
];

const container = {
  type: 17, // Container
  accent_color: 0xed4245, // Red - ALWAYS red for critical deletion
  components: confirmationComponents
};
```

### Rules
- **Accent color**: Always `0xed4245` (red)
- **Header**: `## ⚠️` prefix, name what's being deleted
- **Separator below header**: MANDATORY — visually separates title from details
- **Details block**: Show scope of impact (counts, names, sizes)
- **Consequences**: List every category of data being destroyed
- **Separator above buttons**: MANDATORY — visually separates info from action
- **Cancel button**: Always FIRST (left), Secondary style, ❌ emoji
- **Confirm button**: Always LAST (right), Danger style, 🗑️ emoji
- **Button labels**: "Cancel" and "Yes, Delete [Thing]" — confirm label must say what it does
- **Ephemeral**: Always `true` — deletion confirmations are private
- **No deferred response**: Show confirmation immediately (no loading spinner)

---

## 🎴 Rich Card Pattern

**Use when**: Displaying player-facing visual content — location descriptions, story text, item showcases, announcements, or any content that has a title, body text, optional image, and optional accent color.

**Implementation**: [`richCardUI.js`](../../richCardUI.js) — see [RichCardUI.md](../enablers/RichCardUI.md) for full API reference.

### Structure
```
┌─────────────────────────────────────────┐
│ # Card Title                            │  ← H1 heading (optional)
│                                         │
│ Body content with **markdown** support  │  ← Text Display (required)
│ spanning multiple lines as needed.      │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │          [Image]                    │ │  ← Media Gallery (optional)
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Extra components: buttons, nav, etc.]  │  ← Optional extras
└─────────────────────────────────────────┘
  accent_color: user-defined or theme color
```

### When to Use Rich Card vs LEAN Menu
| Use Rich Card | Use LEAN Menu |
|---------------|---------------|
| Player-facing content display | Admin/host navigation |
| Story/narrative text | Button grids and tool access |
| Location descriptions | Settings and configuration |
| Announcements with images | Multi-section dashboards |

### Rules
- **Title**: Optional — omit for pure content cards, include for titled sections
- **Content**: Required — the body text, supports full Discord markdown
- **Accent Color**: Set via hex string (`#3498db`) or integer — use theme-appropriate colors from the Accent Color Guidelines above
- **Image**: Discord CDN URLs only — shown as Media Gallery below content
- **Ephemeral**: Player-facing display text is typically **non-ephemeral** (visible to all); admin previews are ephemeral

### Quick Example
```javascript
import { buildRichCardResponse } from './richCardUI.js';

// Player-facing card (non-ephemeral)
return buildRichCardResponse({
  title: 'The Ancient Temple',
  content: 'You step through the crumbling archway...',
  color: '#9b59b6',
  image: 'https://cdn.discordapp.com/attachments/.../temple.png',
});

// Admin preview (ephemeral)
return buildRichCardResponse(cardOptions, { ephemeral: true });
```

### Editing Rich Cards
Use `buildRichCardModal()` to create the edit modal and `extractRichCardValues()` to process the submission. See [RichCardUI.md](../enablers/RichCardUI.md) for the complete edit → save → preview flow.

---

## 🔧 Implementation

**For technical implementation using MenuBuilder**, see **[MenuSystemArchitecture.md](../enablers/MenuSystemArchitecture.md)**:
- MENU_REGISTRY structure
- MenuBuilder.create() usage
- Handler patterns with ButtonHandlerFactory
- Migration from legacy inline menus
- Common pitfalls (async/await, ephemeral flags)

**Relationship**: This document defines WHAT menus should look like (visual standards). MenuSystemArchitecture defines HOW to build them (implementation patterns).