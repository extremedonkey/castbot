# Discord Components V2 Architecture

## Overview

Components V2 is Discord's new component system that provides enhanced layout capabilities and better structure for messages and modals. This is an **architectural pattern** that ALL Discord UI in CastBot must follow.

**Sources**:
- [Discord Developer Documentation](https://discord.com/developers/docs/components/reference)
- **[Discord Interaction API](DiscordInteractionAPI.md)** - Foundational interaction concepts

### 📢 Latest Updates (March 2026)

**New Interactive Components:**
- **Radio Group (Type 21)**: Single-select radio buttons for modals (must be in Label)
- **Checkbox Group (Type 22)**: Multi-select checkboxes for modals (must be in Label)
- **Checkbox (Type 23)**: Single yes/no toggle for modals (must be in Label)

**File Component Clarification (Type 13):**
- Displays bot-uploaded file attachments using `attachment://` protocol
- Only available in messages (not modals)
- Requires `IS_COMPONENTS_V2` flag
- **NOT a file upload/input component** — only for bot → user file delivery

**Previous Updates (September 2025):**
- **Label Component (Type 18)**: Wrapper for modal inputs with title/description
- **All Select Menus in Modals**: User, Role, Mentionable, Channel selects now supported
- **String Select in Modals**: Finally works! Must use Label wrapper
- **Text Display in Modals**: Add markdown instructions/content
- **Deprecation**: ActionRow + TextInput pattern deprecated for Label component

## 🚨 CRITICAL: Mandatory for ALL Discord UI

**ALL Discord UI in CastBot MUST use Components V2 pattern**. This is not optional.

### Interaction Response Types Quick Reference

| Response Type | Type # | Use When | Flags Allowed? | Creates New Message? |
|--------------|--------|----------|----------------|---------------------|
| **CHANNEL_MESSAGE_WITH_SOURCE** | 4 | Slash commands, new messages | ✅ Yes (include IS_COMPONENTS_V2) | ✅ Yes |
| **UPDATE_MESSAGE** | 7 | Button clicks, wizard navigation | ❌ No (inherits from original) | ❌ No (edits existing) |
| **DEFERRED_CHANNEL_MESSAGE** | 5 | Slow operations (>3 sec) | ✅ Yes (in follow-up) | ✅ Yes (after defer) |
| **MODAL** | 9 | User input forms | N/A (different structure) | N/A (shows modal) |

**Most Common Pattern:** Button clicks automatically use UPDATE_MESSAGE (ButtonHandlerFactory handles this).

### Key Requirements

1. **Set the IS_COMPONENTS_V2 flag** for NEW messages only:
   ```javascript
   const flags = 1 << 15; // IS_COMPONENTS_V2 (32768)
   ```
   **Exception:** UPDATE_MESSAGE never uses flags (inherits from original message).

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
- **Purpose**: Display bot-uploaded file attachments in messages
- **Features**: References files uploaded via `attachment://` protocol, spoiler support, auto-populated name/size
- **Availability**: Messages only (not modals)
- **Requires**: `IS_COMPONENTS_V2` flag (`1 << 15`)
- **NOT for**: Receiving file uploads from users (see [MessageContent Intent Note](#messagecontent-intent--file-uploads))

```javascript
// Send a message with file attachments
// The actual files must be uploaded as multipart form data alongside the payload
{
  type: 13, // File
  file: { url: "attachment://game.zip" },
  spoiler: false // Optional, defaults to false
}
```

**Full message example with File components:**
```javascript
{
  flags: 32768, // IS_COMPONENTS_V2
  components: [
    {
      type: 10, // Text Display
      content: "# Download Available\nGrab the file here:"
    },
    {
      type: 13, // File
      file: { url: "attachment://export.json" }
    }
  ]
}
// Note: The `name` and `size` fields are auto-populated by Discord in the response
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

**UPDATE (September 2025)**: Modals now support ALL select menu types and the new Label component! ActionRow + TextInput pattern is deprecated in favor of Label components.

#### Label (Type 18) - NEW!
- **Purpose**: Top-level wrapper for modal components with title and description
- **Features**: Replaces ActionRow for better accessibility
- **Contains**: Text Input OR String Select (not both)
- **Usage**: Preferred pattern for all modal inputs

```javascript
{
  type: 18, // Label
  label: "What's your favorite bug?",
  description: "Optional description text", // Optional
  component: {
    type: 3, // String Select
    custom_id: "bug_select",
    placeholder: "Choose...",
    required: false, // Optional, defaults to true in modals
    options: [
      {
        label: "Ant",
        value: "ant",
        description: "(best option)",
        emoji: { name: "🐜" }
      }
    ]
  }
}
```

#### Text Input (Type 4)
- **Purpose**: User text input in modals
- **Styles**: Short (1), Paragraph (2)
- **Features**: Validation, placeholders, required field
- **Usage**: Should be wrapped in Label component (type 18)

```javascript
// Modern pattern with Label wrapper
{
  type: 18, // Label
  label: "Why is it your favorite?",
  description: "Please provide as much detail as possible!",
  component: {
    type: 4, // Text Input
    custom_id: "explanation",
    style: 2, // Paragraph
    min_length: 100,
    max_length: 4000,
    placeholder: "Write your explanation here...",
    required: true
    // Note: 'label' field NOT allowed when inside Label component
  }
}

// Legacy pattern (deprecated but still works)
{
  type: 1, // Action Row
  components: [{
    type: 4, // Text Input
    custom_id: "field_1",
    label: "Field Label", // Only used without Label wrapper
    style: 1
  }]
}
```

#### String Select in Modals (Type 3)
- **Purpose**: Dropdown selection in modals
- **Requirements**: MUST be wrapped in Label component
- **Features**: `required` field support (defaults to true)
- **Restrictions**: `disabled` field not allowed in modals

```javascript
{
  type: 18, // Label (required wrapper)
  label: "Select your role",
  component: {
    type: 3, // String Select
    custom_id: "role_select",
    placeholder: "Choose a role...",
    required: true, // Defaults to true in modals
    min_values: 1,
    max_values: 1,
    options: [
      {
        label: "Admin",
        value: "admin",
        emoji: { name: "👑" }
      }
    ]
  }
}
```

#### All Select Menus Now Supported in Modals!
- **User Select** (Type 5) - Select Discord users
- **Role Select** (Type 6) - Select server roles  
- **Mentionable Select** (Type 7) - Select users or roles
- **Channel Select** (Type 8) - Select channels

All select menus MUST be wrapped in Label component when used in modals:

```javascript
{
  type: 18, // Label
  label: "Choose moderators",
  description: "Select up to 5 users",
  component: {
    type: 5, // User Select
    custom_id: "moderator_select",
    placeholder: "Select users...",
    min_values: 1,
    max_values: 5
  }
}
```

#### Text Display in Modals (Type 10)
- **Purpose**: Display formatted text/markdown in modals
- **Usage**: Top-level component (not in Label)
- **Features**: Full markdown support

```javascript
{
  type: 10, // Text Display
  content: "### Instructions\n\nPlease fill out all required fields below."
}
```

#### Radio Group (Type 21)
- **Purpose**: Single-select from a list of options (radio buttons)
- **Availability**: Modals only, MUST be wrapped in Label component
- **Limits**: 2-10 options
- **Features**: `required` field (defaults to true), `default` on options

```javascript
{
  type: 18, // Label (required wrapper)
  label: "Select difficulty",
  description: "Choose one option",
  component: {
    type: 21, // Radio Group
    custom_id: "difficulty_select",
    required: true, // Defaults to true
    options: [
      {
        label: "Easy",
        value: "easy",
        description: "For beginners"
      },
      {
        label: "Normal",
        value: "normal",
        description: "Standard experience",
        default: true // Pre-selected
      },
      {
        label: "Hard",
        value: "hard",
        description: "For veterans"
      }
    ]
  }
}
```

**Interaction response** returns `value` (string) or `null` if nothing selected:
```javascript
// In modal submit handler:
// component.type === 21, component.custom_id === "difficulty_select"
// component.value === "normal" (or null)
```

#### Checkbox Group (Type 22)
- **Purpose**: Multi-select from a list of options (checkboxes)
- **Availability**: Modals only, MUST be wrapped in Label component
- **Limits**: 1-10 options, `min_values` 0-10, `max_values` 1-10
- **Features**: `required` field (defaults to true), `default` on options

```javascript
{
  type: 18, // Label (required wrapper)
  label: "Select features to enable",
  component: {
    type: 22, // Checkbox Group
    custom_id: "features_select",
    required: true,
    min_values: 1,
    max_values: 5,
    options: [
      {
        label: "Fog of War",
        value: "fog",
        description: "Hide unexplored areas",
        default: true
      },
      {
        label: "Stamina System",
        value: "stamina",
        description: "Limit player actions"
      },
      {
        label: "Custom Actions",
        value: "custom_actions",
        description: "Enable location-based actions"
      }
    ]
  }
}
```

**Interaction response** returns `values` (array of strings) or `[]`:
```javascript
// component.type === 22, component.custom_id === "features_select"
// component.values === ["fog", "stamina"] (or [])
```

**Note**: If `min_values` is 0, `required` must be `false`.

#### Checkbox (Type 23)
- **Purpose**: Single yes/no toggle
- **Availability**: Modals only, MUST be wrapped in Label component
- **Features**: `default` boolean for initial state

```javascript
{
  type: 18, // Label (required wrapper)
  label: "Delete custom actions too?",
  description: "This will permanently remove all custom actions for this map",
  component: {
    type: 23, // Checkbox
    custom_id: "delete_actions",
    default: false // Unchecked by default
  }
}
```

**Interaction response** returns `value` (boolean):
```javascript
// component.type === 23, component.custom_id === "delete_actions"
// component.value === true (checked) or false (unchecked)
```

**Note**: Checkbox cannot be set as `required`. Use a Checkbox Group with 1 option + `required: true` if you need mandatory acknowledgment.

#### File Upload (Type 19) - NEW!
- **Purpose**: Allow users to upload files within modals
- **Availability**: Modals only, MUST be wrapped in Label component
- **Limits**: 0-10 files per component (`min_values`, `max_values`)
- **File size**: Based on user's upload limit in that channel
- **Key difference from File (Type 13)**: File is bot→user (display attachments). File Upload is user→bot (receive uploads).

```javascript
// Modal with File Upload
{
  type: 9, // MODAL interaction response
  data: {
    custom_id: "import_modal",
    title: "Import Safari Data",
    components: [
      {
        type: 18, // Label (required wrapper)
        label: "File Upload",
        description: "Upload your Safari export JSON file",
        component: {
          type: 19, // File Upload
          custom_id: "file_upload",
          min_values: 1,
          max_values: 1,
          required: true
        }
      }
    ]
  }
}
```

**File Upload Structure:**

| Field | Type | Description |
|-------|------|-------------|
| type | integer | `19` for file upload |
| id? | integer | Optional identifier for component |
| custom_id | string | ID for the file upload; 1-100 characters |
| min_values? | integer | Minimum files that must be uploaded (default 1); min 0, max 10 |
| max_values? | integer | Maximum files that can be uploaded (default 1); max 10 |
| required? | boolean | Whether files must be uploaded to submit the modal (default `true`) |

**File Upload Interaction Response Structure:**

| Field | Type | Description |
|-------|------|-------------|
| type | integer | `19` for File Upload |
| id | integer | Unique identifier for the component |
| custom_id | string | Developer-defined identifier; 1-100 characters |
| values | array of snowflakes | IDs of uploaded files found in `resolved.attachments` |

```javascript
// In modal submit handler, the interaction data looks like:
{
  type: 5, // InteractionType.MODAL_SUBMIT
  data: {
    custom_id: "import_modal",
    components: [
      {
        custom_id: "file_upload",
        id: 2,
        type: 19,
        values: ["111111111111111111"] // Attachment snowflake IDs
      }
    ],
    resolved: {
      attachments: {
        "111111111111111111": {
          id: "111111111111111111",
          filename: "safari_export.json",
          size: 48291,
          url: "https://cdn.discordapp.com/...",
          content_type: "application/json"
        }
      }
    }
  }
}

// Access uploaded file:
const attachmentId = component.values[0];
const attachment = req.body.data.resolved.attachments[attachmentId];
const response = await fetch(attachment.url);
const jsonData = await response.json();
```

**Why this matters for CastBot**: File Upload (Type 19) delivers files via the interaction webhook (HTTP), NOT the gateway. This means it requires **NO privileged intents** — making it the solution for replacing `createMessageCollector` patterns that currently require `MessageContent` intent. See [RaP 0940: Privileged Intents Analysis](../01-RaP/0940_20260317_PrivilegedIntents_Analysis.md).

## MessageContent Intent & File Uploads

**🚨 IMPORTANT**: The File component (Type 13) is for **sending** files to users, NOT for **receiving** file uploads from users. The **File Upload** component (Type 19) is the correct way to receive files — see above.

**Current Safari Import Problem:**
The Safari import uses `channel.createMessageCollector()` to wait for user file uploads. This requires `MessageContent` intent because Discord strips the `attachments` field from user messages without it. Discord **denied** our `MessageContent` intent application (Nov 2025), which blocks scaling past 100 servers.

**Solutions (two options):**

**Option A: Modal File Upload (Type 19) — Preferred**
Use a modal with File Upload component. Files arrive via interaction webhook, no gateway intents needed:
```javascript
// See File Upload (Type 19) section above for full example
```

**Option B: Slash Command Attachment Option (Type 11)**
Discord slash commands support an `ATTACHMENT` option type (type 11) that delivers files through the interaction webhook:

```javascript
// Register command with attachment option
{
  name: 'import',
  description: 'Import Safari data from JSON file',
  options: [{
    name: 'file',
    description: 'The Safari export JSON file',
    type: 11, // ATTACHMENT type
    required: true
  }]
}

// In handler, access via:
// const attachment = req.body.data.resolved.attachments[attachmentId];
// attachment.url, attachment.filename, attachment.size, attachment.content_type
```

**Why both work**: Interaction payloads (slash commands, modals, buttons) are sent via HTTP webhook, not the gateway. They include full data regardless of gateway intents.

**Migration plan**: Replace the `safari_import_data` and `playerdata_import` message collector patterns with modal File Upload (Type 19) or slash command ATTACHMENT option. Full analysis: [RaP 0940: Privileged Intents Analysis](../01-RaP/0940_20260317_PrivilegedIntents_Analysis.md).

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

**Modern Modal (with Label components):**
```javascript
const modal = {
  type: 9, // MODAL interaction response
  data: {
    custom_id: "bug_report_modal",
    title: "Bug Report",
    components: [
      // Text Display for instructions
      {
        type: 10, // Text Display
        content: "### Please fill out the form below\n\nAll fields marked with * are required."
      },
      // String Select in Label
      {
        type: 18, // Label
        label: "What's your favorite bug?",
        component: {
          type: 3, // String Select
          custom_id: "bug_select",
          placeholder: "Choose...",
          options: [
            {
              label: "Ant",
              value: "ant",
              description: "(best option)",
              emoji: { name: "🐜" }
            },
            {
              label: "Butterfly",
              value: "butterfly",
              emoji: { name: "🦋" }
            }
          ]
        }
      },
      // Text Input in Label
      {
        type: 18, // Label
        label: "Why is it your favorite?",
        description: "Please provide as much detail as possible!",
        component: {
          type: 4, // Text Input
          custom_id: "bug_explanation",
          style: 2, // Paragraph
          min_length: 100,
          max_length: 4000,
          placeholder: "Write your explanation here...",
          required: true
        }
      },
      // User Select in Label
      {
        type: 18, // Label
        label: "Who else likes this bug?",
        component: {
          type: 5, // User Select
          custom_id: "bug_fans",
          placeholder: "Select users...",
          min_values: 0,
          max_values: 5
        }
      }
    ]
  }
};
```

**Legacy Modal Pattern (deprecated but still functional):**
```javascript
const legacyModal = {
  type: 9, // MODAL interaction response
  data: {
    custom_id: "modal_id",
    title: "Modal Title",
    components: [
      {
        type: 1, // Action Row (deprecated for modals)
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

### 1. UPDATE_MESSAGE Flag Restrictions (CRITICAL)

**UPDATE_MESSAGE (Type 7)** edits an existing message. It CANNOT have flags because the message already exists with its original flags.

**❌ WRONG:** Including flags in UPDATE_MESSAGE responses
```javascript
// This will cause "interaction failed"
return res.send({
  type: InteractionResponseType.UPDATE_MESSAGE,
  data: {
    flags: (1 << 15), // ❌ Discord rejects: "Invalid flags for UPDATE_MESSAGE"
    components: [...]
  }
});
```

**✅ CORRECT:** UPDATE_MESSAGE without flags
```javascript
return res.send({
  type: InteractionResponseType.UPDATE_MESSAGE,
  data: {
    components: [...] // ✅ No flags - inherits from original message
  }
});
```

**Why This Works:**
- Original message was created with `flags: IS_COMPONENTS_V2`
- UPDATE_MESSAGE edits that message (same message ID)
- Components V2 context is inherited automatically
- Container (type 17) works without re-specifying the flag

**ButtonHandlerFactory Auto-Handles This:**
```javascript
// ButtonHandlerFactory automatically detects button clicks and uses UPDATE_MESSAGE
} else if (custom_id === 'my_button') {
  return ButtonHandlerFactory.create({
    id: 'my_button',
    handler: async (context) => {
      // You can include flags here - ButtonHandlerFactory strips them for UPDATE_MESSAGE
      return {
        flags: (1 << 15), // Factory strips this for UPDATE_MESSAGE
        components: [{ type: 17, ... }]
      };
    }
  })(req, res, client);
}
```

**When UPDATE_MESSAGE is Used:**
- ✅ Button clicks in menus (navigating wizard steps)
- ✅ Select menu interactions
- ✅ Any MESSAGE_COMPONENT interaction (type 3)
- ✅ DM interactions (works identically to channels!)

**When CHANNEL_MESSAGE_WITH_SOURCE is Used:**
- ✅ Slash commands (`/menu`, `/castlist`)
- ✅ Creating new ephemeral messages
- ✅ When you want to keep the original message intact

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

- **[Discord Interaction API](DiscordInteractionAPI.md)** - Foundational Discord API concepts
- [Discord Interaction Patterns](DiscordInteractionPatterns.md) - CastBot-specific implementation patterns
- [ButtonHandlerFactory.md](../enablers/ButtonHandlerFactory.md) - Button implementation patterns
- [EntityEditFramework.md](../enablers/EntityEditFramework.md) - Entity UI patterns
- [DefinitionOfDone.md](../workflow/DefinitionOfDone.md) - UI requirements

## References

- [Discord Components Reference](https://discord.com/developers/docs/components/reference)
- [Message Components Guide](https://discord.com/developers/docs/interactions/message-components)
- [Modal Components Guide](https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-response-object-modal)