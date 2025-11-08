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
  - Position: **Far-left (first position in action row)**, after separator
  - **CRITICAL**: Back buttons NEVER have emojis, regardless of destination

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

## 🔧 Implementation

**For technical implementation using MenuBuilder**, see **[MenuSystemArchitecture.md](../enablers/MenuSystemArchitecture.md)**:
- MENU_REGISTRY structure
- MenuBuilder.create() usage
- Handler patterns with ButtonHandlerFactory
- Migration from legacy inline menus
- Common pitfalls (async/await, ephemeral flags)

**Relationship**: This document defines WHAT menus should look like (visual standards). MenuSystemArchitecture defines HOW to build them (implementation patterns).