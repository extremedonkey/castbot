# Discord Components V2 Architecture

## Overview

Components V2 is Discord's new component system that provides enhanced layout capabilities and better structure for messages and modals. This is an **architectural pattern** that ALL Discord UI in CastBot must follow.

**Source**: [Discord Developer Documentation](https://discord.com/developers/docs/components/reference)

## 🚨 CRITICAL: Mandatory for ALL Discord UI

**ALL Discord UI in CastBot MUST use Components V2 pattern**. This is not optional.

### Key Requirements

1. **Set the IS_COMPONENTS_V2 flag** for all messages:
   ```javascript
   const flags = 1 << 15; // IS_COMPONENTS_V2
   ```

2. **NEVER use `content` field** with Components V2:
   ```javascript
   // ❌ FORBIDDEN - Will fail
   const response = {
     content: "Text here", // THIS WILL FAIL
     flags: flags
   };
   
   // ✅ REQUIRED - Use Container + Text Display
   const response = {
     components: [{
       type: 17, // Container
       components: [
         {
           type: 10, // Text Display
           content: "Your message content here"
         }
       ]
     }],
     flags: flags
   };
   ```

3. **Component Limits**:
   - Messages allow up to 40 total components
   - Action Rows can contain maximum 5 buttons
   - Modals can have maximum 5 text inputs

## Architecture Components

### Layout Components

#### Container (Type 17)
- **Purpose**: Visual grouping of components
- **Features**: Optional accent color bar
- **Usage**: Top-level wrapper for all UI

```javascript
{
  type: 17, // Container
  accent_color: 0x5865f2, // Optional
  components: [ /* child components */ ]
}
```

#### Action Row (Type 1)
- **Purpose**: Horizontal layout for interactive components
- **Limits**: Maximum 5 buttons OR 1 select menu
- **Usage**: Wraps buttons and select menus

```javascript
{
  type: 1, // Action Row
  components: [ /* up to 5 buttons or 1 select */ ]
}
```

#### Section (Type 9)
- **Purpose**: Text with optional accessory
- **Features**: Can include thumbnail or button accessory
- **Usage**: Rich content layouts
- **IMPORTANT**: Despite docs claiming "1-3 child components", Discord only accepts ONE

```javascript
{
  type: 9, // Section
  components: [
    { type: 10, content: "text" }  // EXACTLY ONE Text Display component
  ],
  accessory: { /* thumbnail or button */ }
}
```

#### Separator (Type 14)
- **Purpose**: Visual spacing between components
- **Features**: Optional divider line
- **Usage**: Organize content sections

```javascript
{
  type: 14, // Separator
  divider: true, // Optional, default true
  spacing: 1 // 1 = small, 2 = large
}
```

### Content Components

#### Text Display (Type 10)
- **Purpose**: Display formatted text
- **Features**: Full markdown support
- **Usage**: Replaces traditional `content` field

```javascript
{
  type: 10, // Text Display
  content: "# Heading\n**Bold** and *italic* text"
}
```

#### Media Gallery (Type 12)
- **Purpose**: Display 1-10 images
- **Features**: Alt text, spoiler support
- **Usage**: Image galleries

```javascript
{
  type: 12, // Media Gallery
  items: [
    {
      media: { url: "https://..." },
      description: "Alt text",
      spoiler: false
    }
  ]
}
```

#### Thumbnail (Type 11)
- **Purpose**: Small image display
- **Features**: Used as section accessory
- **Usage**: Visual context in sections

```javascript
{
  type: 11, // Thumbnail
  media: { url: "https://..." },
  description: "Alt text"
}
```

#### File (Type 13)
- **Purpose**: Display attached files
- **Features**: Direct file references
- **Usage**: File downloads

```javascript
{
  type: 13, // File
  file: { url: "attachment://filename.pdf" }
}
```

### Interactive Components

#### Button (Type 2)
- **Purpose**: Clickable actions
- **Styles**: Primary (1), Secondary (2), Success (3), Danger (4), Link (5)
- **Features**: Custom ID, emoji, disabled state

```javascript
{
  type: 2, // Button
  custom_id: "button_id",
  label: "Click Me",
  style: 1, // Primary
  emoji: { name: "🎯" },
  disabled: false
}
```

#### Select Menus
- **String Select** (Type 3): Custom options with default selection support
- **User Select** (Type 5): User selection with default_values
- **Role Select** (Type 6): Role selection
- **Mentionable Select** (Type 7): Users + roles
- **Channel Select** (Type 8): Channel selection

##### String Select (Type 3)
```javascript
{
  type: 3, // String Select
  custom_id: "select_menu",
  placeholder: "Choose an option",
  options: [
    {
      label: "Option 1",
      value: "opt1",
      description: "Description",
      emoji: { name: "1️⃣" },
      default: true // Pre-select this option
    },
    {
      label: "Option 2",
      value: "opt2",
      description: "Another option",
      emoji: { name: "2️⃣" },
      default: false // Not pre-selected
    }
  ],
  min_values: 0, // Allow deselecting all
  max_values: 2 // Allow multiple selections
}
```

##### String Select Default Behavior (Important Discovery)
**CRITICAL**: Discord String Selects DO support pre-selection via the `default` property on options, contrary to some documentation. This behavior has been verified in production:

```javascript
// Pre-selecting items in a String Select
const options = items.map(item => ({
  label: item.name,
  value: item.id,
  description: item.description,
  default: item.isSelected // ✅ This WORKS - item will be pre-selected if true
}));
```

**Real-world Examples in CastBot:**
- **Store Item Multi-Select** (`entityManagementUI.js:939`): Pre-selects currently stocked items
- **Paused Players Select** (`pausedPlayersManager.js:214`): Pre-selects currently paused players

##### User Select (Type 5) 
```javascript
{
  type: 5, // User Select
  custom_id: "user_select",
  placeholder: "Select users",
  min_values: 0,
  max_values: 25,
  default_values: [ // Pre-select specific users
    { id: "391415444084490240", type: "user" },
    { id: "123456789012345678", type: "user" }
  ]
}
```

### Modal Components

#### Text Input (Type 4)
- **Purpose**: User text input in modals
- **Styles**: Short (1), Paragraph (2)
- **Features**: Validation, placeholders

```javascript
{
  type: 4, // Text Input
  custom_id: "input_field",
  label: "Enter Name",
  style: 1, // Short
  min_length: 1,
  max_length: 100,
  placeholder: "John Doe",
  required: true
}
```

## Common Patterns in CastBot

### Standard Message Pattern
```javascript
const response = {
  flags: (1 << 15), // IS_COMPONENTS_V2
  components: [{
    type: 17, // Container
    accent_color: 0x5865f2,
    components: [
      // Header
      {
        type: 10, // Text Display
        content: "## 🎯 Title Here\n\nDescription text"
      },
      // Separator
      { type: 14 },
      // Buttons
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            custom_id: "action_1",
            label: "Action",
            style: 1
          }
        ]
      }
    ]
  }]
};
```

### Modal Pattern
```javascript
const modal = {
  type: 9, // MODAL interaction response
  data: {
    custom_id: "modal_id",
    title: "Modal Title",
    components: [
      {
        type: 1, // Action Row
        components: [{
          type: 4, // Text Input
          custom_id: "field_1",
          label: "Field Label",
          style: 1
        }]
      }
    ]
  }
};
```

## Migration Guide

### Converting Legacy Messages

**Before (Legacy):**
```javascript
return res.send({
  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
  data: {
    content: "Hello World!",
    embeds: [{ /* embed data */ }],
    components: [{ /* legacy components */ }]
  }
});
```

**After (Components V2):**
```javascript
return res.send({
  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
  data: {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      components: [
        {
          type: 10, // Text Display
          content: "Hello World!"
        },
        // Convert embeds to sections or media galleries
        // Add interactive components
      ]
    }]
  }
});
```

## Common Pitfalls

### 1. UPDATE_MESSAGE Flag Restrictions
**❌ WRONG:** Including flags in UPDATE_MESSAGE responses
```javascript
// This will cause "interaction failed"
return res.send({
  type: InteractionResponseType.UPDATE_MESSAGE,
  data: {
    flags: (1 << 15), // This causes Discord to reject the response
    components: [...]
  }
});
```

**✅ CORRECT:** UPDATE_MESSAGE without flags
```javascript
return res.send({
  type: InteractionResponseType.UPDATE_MESSAGE,
  data: {
    components: [...] // No flags in data
  }
});
```

**Exception**: When returning from ButtonHandlerFactory handlers, include flags in the return object - the factory will strip them for UPDATE_MESSAGE:
```javascript
// In handler
return {
  flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL,
  components: [...]
}; // Factory handles flag stripping
```

### 2. Mixing Legacy and V2
**❌ WRONG:** Using `content` with V2 flag
```javascript
{
  content: "Text", // Will fail!
  flags: (1 << 15),
  components: [...]
}
```


### 3. Exceeding Limits
**❌ WRONG:** More than 5 buttons in action row
```javascript
{
  type: 1, // Action Row
  components: [
    button1, button2, button3, button4, button5, button6 // Too many!
  ]
}
```

### 4. Incorrect Nesting
**❌ WRONG:** Components outside container
```javascript
{
  flags: (1 << 15),
  components: [
    { type: 10, content: "Text" }, // Must be in container!
    { type: 1, components: [...] }
  ]
}
```

## Best Practices

1. **Always use Container** as top-level wrapper
2. **Group related content** in sections
3. **Use separators** for visual organization
4. **Respect component limits** (5 buttons/row, 40 total)
5. **Test on mobile** - UI should be responsive
6. **Use appropriate styles** for button importance
7. **Provide placeholders** for select menus
8. **Add alt text** for images

## Related Documentation

- [ButtonHandlerFactory.md](ButtonHandlerFactory.md) - Button implementation patterns
- [EntityEditFramework.md](EntityEditFramework.md) - Entity UI patterns
- [DefinitionOfDone.md](../workflow/DefinitionOfDone.md) - UI requirements

## References

- [Discord Components Reference](https://discord.com/developers/docs/components/reference)
- [Message Components Guide](https://discord.com/developers/docs/interactions/message-components)
- [Modal Components Guide](https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-response-object-modal)