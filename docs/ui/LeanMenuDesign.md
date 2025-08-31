# LEAN Menu Design Standards

**🎯 Philosophy**: Maximize information density while maintaining clarity and visual hierarchy

## ✅ Menu Structure Pattern
```javascript
// LEAN Menu Template - Copy this pattern for ALL menus
const containerComponents = [
  { type: 10, content: `## CastBot | Menu Title` },     // Header
  { type: 14 },                                         // Separator
  { type: 10, content: `> **\`📊 Section Name\`**` },  // Section header
  actionRow1.toJSON(),                                  // Buttons (max 5)
  { type: 14 },                                         // Separator between sections
  { type: 10, content: `> **\`🔧 Next Section\`**` },  // Next section
  actionRow2.toJSON(),                                  // More buttons
  { type: 14 },                                         // Final separator
  navigationRow.toJSON()                                // Navigation buttons
];
```

## ✅ Section Organization Rules
- **Group by function**: Analytics together, admin tools together, danger actions together
- **Progressive disclosure**: Most-used → Least-used → Dangerous
- **Section headers**: Use `> **\`📊 Section Name\`**` format (backticks for emphasis)
- **Maximum 3-4 sections** per menu to prevent scrolling
- **5 buttons max** per ActionRow (Discord hard limit)

## ✅ Button Styling Hierarchy
```javascript
ButtonStyle.Primary   // Main actions, primary features
ButtonStyle.Secondary // Standard actions, navigation
ButtonStyle.Success   // Positive actions, confirmations  
ButtonStyle.Danger    // Destructive actions ONLY
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
  flags: (1 << 15),                 // IS_COMPONENTS_V2 (MANDATORY)
  components: [menuContainer]
};
```

## ❌ Anti-Patterns to Avoid
- **Sparse layouts**: Don't use one button per row unless necessary
- **Redundant text**: Don't repeat menu name in every section
- **Excessive dividers**: Don't separate every single button
- **Mixed metaphors**: Keep emoji themes consistent within sections
- **Nested menus beyond 2 levels**: Flatten navigation where possible

## 📏 Size Guidelines
- **Menu height**: Aim for 5-8 visible rows without scrolling
- **Button text**: 2-3 words ideal, 4 words maximum
- **Section headers**: 1-3 words with single emoji
- **Total components**: Stay under 20 components per container

## 🎯 Example: Analytics Menu (Optimal LEAN Design)
```
## CastBot | Analytics & Admin
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
[⬅ Menu]
```
**Result**: 9 buttons + navigation in just 5 ActionRows with clear visual separation