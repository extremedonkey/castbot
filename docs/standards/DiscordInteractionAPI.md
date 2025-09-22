# Discord Interaction API Reference

## Overview

This document provides a comprehensive reference for Discord's Interaction API, covering the fundamental structures, types, and patterns for receiving and responding to user interactions. This is the **foundational layer** that all Discord UI in CastBot builds upon.

**Source**: [Discord Developer Documentation - Interactions](https://discord.com/developers/docs/interactions/receiving-and-responding)

## 🚨 CRITICAL: Foundation for Components V2

**This API is the foundation for [Components V2](ComponentsV2.md)**. Understanding interaction structure is essential for:
- Proper response handling
- Component data extraction
- Token management
- Error debugging

## Interaction Fundamentals

### What is an Interaction?

An **Interaction** is the message your application receives when a user:
- Uses a slash command
- Clicks a button or selects from a menu
- Submits a modal form
- Uses a user/message command

Every Discord UI action in CastBot triggers an interaction that must be handled within **3 seconds**.

### Core Interaction Object

```javascript
{
  id: "snowflake",                    // Unique interaction ID
  application_id: "snowflake",        // Your app ID
  type: 3,                           // MESSAGE_COMPONENT
  data: { /* interaction-specific */ }, // Button/select data
  guild_id: "snowflake",             // Server ID
  channel_id: "snowflake",           // Channel ID
  member: { /* guild member */ },     // User in server
  user: { /* user object */ },       // User in DM
  token: "string",                   // 15-minute response token
  version: 1,                        // Always 1
  message: { /* message object */ }   // For component interactions
}
```

## Interaction Types

| Type | Value | Description | CastBot Usage |
|------|-------|-------------|---------------|
| **PING** | 1 | Discord health check | Auto-handled |
| **APPLICATION_COMMAND** | 2 | Slash commands | `/menu`, `/castlist` |
| **MESSAGE_COMPONENT** | 3 | Button/select clicks | **Primary CastBot pattern** |
| **APPLICATION_COMMAND_AUTOCOMPLETE** | 4 | Command suggestions | Not used |
| **MODAL_SUBMIT** | 5 | Form submissions | Admin forms, safari inputs |

### MESSAGE_COMPONENT (Type 3) - Primary Pattern

**This is CastBot's main interaction type** for all button and select menu interactions.

```javascript
// Component interaction data structure
{
  custom_id: "button_safari_move_north",    // Your button identifier
  component_type: 2,                        // Button (2) or Select (3-8)
  values: ["option1", "option2"],          // For select menus only
  resolved: {                              // Auto-resolved Discord entities
    users: { "user_id": { /* user */ } },
    roles: { "role_id": { /* role */ } },
    channels: { "channel_id": { /* channel */ } }
  }
}
```

## Response Types & Patterns

### Immediate Response Types

| Type | Value | Description | CastBot Usage |
|------|-------|-------------|---------------|
| **CHANNEL_MESSAGE_WITH_SOURCE** | 4 | New message | Initial command responses |
| **DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE** | 5 | "Thinking..." state | Long operations (>3s) |
| **DEFERRED_UPDATE_MESSAGE** | 6 | Silent ACK | Quick updates |
| **UPDATE_MESSAGE** | 7 | Edit original | **Primary button pattern** |
| **MODAL** | 9 | Show form | Admin configuration |

### CastBot Response Patterns

#### Pattern 1: Button Updates (Most Common)
```javascript
// User clicks button → update the same message
return res.send({
  type: InteractionResponseType.UPDATE_MESSAGE,
  data: {
    // ❌ NEVER include flags in UPDATE_MESSAGE
    components: [{
      type: 17, // Container
      components: [/* updated UI */]
    }]
  }
});
```

#### Pattern 2: New Messages (Commands)
```javascript
// Slash command → new message
return res.send({
  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
  data: {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      components: [/* initial UI */]
    }]
  }
});
```

#### Pattern 3: Long Operations (Deferred)
```javascript
// Initial response (within 3s)
await res.send({
  type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  data: { flags: InteractionResponseFlags.EPHEMERAL }
});

// Follow-up (within 15 minutes)
await fetch(`https://discord.com/api/v10/webhooks/${client.user.id}/${interaction.token}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    flags: (1 << 15),
    components: [/* final UI */]
  })
});
```

#### Pattern 4: Modal Forms
```javascript
// Show modal form
return res.send({
  type: InteractionResponseType.MODAL,
  data: {
    custom_id: "safari_location_edit",
    title: "Edit Location",
    components: [
      {
        type: 18, // Label (Components V2)
        label: "Location Name",
        component: {
          type: 4, // Text Input
          custom_id: "location_name",
          style: 1, // Short
          required: true
        }
      }
    ]
  }
});
```

## Token Management & Timing

### Critical Timing Rules

1. **3-second rule**: Must respond to interaction within 3 seconds or token invalidates
2. **15-minute rule**: Interaction token valid for 15 minutes for follow-ups
3. **No gateway responses**: All responses must be HTTP, even if received via gateway

### Follow-up Message Endpoints

```javascript
// Edit original response
PATCH /webhooks/{app_id}/{token}/messages/@original

// Delete original response
DELETE /webhooks/{app_id}/{token}/messages/@original

// Send new follow-up message
POST /webhooks/{app_id}/{token}

// Edit follow-up message
PATCH /webhooks/{app_id}/{token}/messages/{message_id}
```

## Data Extraction Patterns

### Button Interactions
```javascript
// Extract button data
const { custom_id, component_type } = interaction.data;
if (custom_id === 'safari_move_north') {
  // Handle movement
}
```

### Select Menu Interactions
```javascript
// Extract select values
const { custom_id, values, resolved } = interaction.data;
if (custom_id === 'player_select') {
  const selectedUserIds = values; // Array of user IDs
  const users = resolved?.users; // Full user objects
}
```

### Modal Submissions
```javascript
// Extract form data
const { custom_id, components } = interaction.data;
const textInputs = components.flatMap(row =>
  row.components.filter(comp => comp.type === 4)
);
const locationName = textInputs.find(input =>
  input.custom_id === 'location_name'
)?.value;
```

### Context Extraction (CastBot Standard)
```javascript
// Standard context extraction for all handlers
const { guild_id, channel_id, member, user } = interaction;
const userId = member?.user?.id || user?.id;
const guildId = guild_id;
const channelId = channel_id;
```

## Permission & Context Handling

### App Permissions
```javascript
// Check app permissions in interaction context
const { app_permissions } = interaction;
const hasAttachFiles = BigInt(app_permissions) & BigInt(0x8000); // ATTACH_FILES
```

### Installation Context
```javascript
// Handle user vs guild installations
const { authorizing_integration_owners } = interaction;
const isGuildInstall = authorizing_integration_owners?.['0']; // GUILD_INSTALL
const isUserInstall = authorizing_integration_owners?.['1'];  // USER_INSTALL
```

### Interaction Context Types
| Context | Value | Description |
|---------|-------|-------------|
| **GUILD** | 0 | Server context |
| **BOT_DM** | 1 | DM with bot |
| **PRIVATE_CHANNEL** | 2 | Group DMs |

## Error Handling & Debugging

### Common Failure Patterns

#### 1. Token Expiration
```javascript
// ❌ Taking too long (>3s)
setTimeout(() => {
  res.send({ type: 4, data: { content: "Too late!" } });
}, 5000); // Will fail

// ✅ Defer if operation takes time
res.send({ type: 5 }); // Deferred response
// Then use webhook for actual response
```

#### 2. Invalid Response Structure
```javascript
// ❌ Malformed component structure
{
  type: 7, // UPDATE_MESSAGE
  data: {
    flags: (1 << 15), // Flags not allowed in UPDATE_MESSAGE
    components: [/* invalid nesting */]
  }
}

// ✅ Proper UPDATE_MESSAGE
{
  type: 7,
  data: {
    components: [{
      type: 17, // Container
      components: [/* valid V2 structure */]
    }]
  }
}
```

#### 3. Missing Interaction Response
```javascript
// ❌ Handler without response
if (custom_id === 'my_button') {
  doSomething(); // No response = timeout
}

// ✅ Always respond
if (custom_id === 'my_button') {
  doSomething();
  return res.send({ type: 7, data: { /* response */ } });
}
```

### Debugging Checklist

1. **Response within 3s?** Check for deferred responses
2. **Valid component structure?** Use [Components V2](ComponentsV2.md) patterns
3. **Proper flags usage?** No flags in UPDATE_MESSAGE
4. **Token still valid?** 15-minute expiration
5. **Handler registered?** Check [ButtonHandlerFactory](../enablers/ButtonHandlerFactory.md)

## Integration with CastBot Patterns

### ButtonHandlerFactory Integration
```javascript
// ButtonHandlerFactory automatically handles response type conversion
return ButtonHandlerFactory.create({
  id: 'safari_move',
  handler: async (context) => {
    // Your logic here
    return {
      flags: (1 << 15) | InteractionResponseFlags.EPHEMERAL,
      components: [/* Components V2 structure */]
    };
  }
  // Factory converts to UPDATE_MESSAGE and strips flags
})(req, res, client);
```

### Components V2 Integration
Every interaction response MUST use [Components V2](ComponentsV2.md) patterns:
```javascript
// All responses use Container + Components V2
const response = {
  flags: (1 << 15), // IS_COMPONENTS_V2 (except UPDATE_MESSAGE)
  components: [{
    type: 17, // Container
    components: [
      { type: 10, content: "Content here" }, // Text Display
      { type: 14 }, // Separator
      // Action rows, selects, etc.
    ]
  }]
};
```

## Rate Limiting & Performance

### Interaction Endpoints (No Global Rate Limit)
- **Create Interaction Response**: Not bound to global rate limit
- **Follow-up Messages**: Share webhook rate limits
- **Edit Original Response**: Share webhook rate limits

### Best Practices
1. **Respond immediately** to button clicks (UPDATE_MESSAGE)
2. **Use deferred responses** for operations >1 second
3. **Batch follow-up messages** to avoid webhook rate limits
4. **Cache resolved data** to avoid repeated API calls

## Related Documentation

- **[Components V2](ComponentsV2.md)** - UI component structure and patterns
- **[Discord Interaction Patterns](DiscordInteractionPatterns.md)** - CastBot-specific implementation patterns
- **[ButtonHandlerFactory](../enablers/ButtonHandlerFactory.md)** - Response handling framework
- **[Entity Edit Framework](../enablers/EntityEditFramework.md)** - Complex form interactions

## References

- [Discord Interactions Documentation](https://discord.com/developers/docs/interactions/receiving-and-responding)
- [Discord API Endpoints](https://discord.com/developers/docs/resources/webhook#execute-webhook)
- [Interaction Response Types](https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-response-object-interaction-callback-type)