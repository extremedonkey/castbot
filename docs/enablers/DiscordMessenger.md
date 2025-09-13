# Discord Messenger Service

## Overview

The Discord Messenger Service is a centralized, reusable messaging system for CastBot that handles all Discord communication needs. Following the principle that `app.js` should only handle routing, this service encapsulates all messaging logic in a clean, maintainable module.

## Architecture Principles

### Core Design Philosophy
- **Maximum Reusability**: One service for all messaging needs
- **Zero Breaking Changes**: Isolated module that doesn't touch existing code
- **Consistent Error Handling**: Never throws, always returns result objects
- **Components V2 Compliant**: All messages follow Discord's latest standards
- **Lightweight History**: JSON-based message tracking (last 1000 messages)

### Service Pattern
```javascript
// Static methods, no instantiation needed
DiscordMessenger.sendDM(client, userId, content);
DiscordMessenger.sendToChannel(client, channelId, content);
DiscordMessenger.sendWelcomePackage(client, guild);
```

## API Reference

### Core Methods

#### `sendDM(client, userId, content, options)`
Send a direct message to a user.

**Parameters:**
- `client` {Client} - Discord.js client instance
- `userId` {string} - Target user's Discord ID
- `content` {string|Object} - Message content (auto-formatted for Components V2)
- `options` {Object} - Optional configuration

**Returns:**
```javascript
{
  success: boolean,
  messageId: string,  // If successful
  recipient: string,  // User tag
  error: string      // If failed
}
```

**Example:**
```javascript
const result = await DiscordMessenger.sendDM(
  client, 
  '391415444084490240', 
  'Hello from CastBot!'
);
```

#### `sendToChannel(client, channelId, content, options)`
Send a message to a specific channel.

**Parameters:**
- `client` {Client} - Discord.js client instance
- `channelId` {string} - Target channel ID
- `content` {string|Object} - Message content
- `options` {Object} - Optional configuration

**Returns:**
```javascript
{
  success: boolean,
  messageId: string,  // If successful
  channel: string,    // Channel name
  error: string      // If failed
}
```

### Template Methods

#### `sendWelcomePackage(client, guild)`
Send welcome messages when bot is added to a new server.

**Behavior:**
1. Sends DM to server owner with comprehensive welcome guide
2. Posts in system channel if available
3. Logs all attempts

**Returns:**
```javascript
{
  success: boolean,
  dmSent: boolean,
  channelMessageSent: boolean
}
```

#### `sendAdminAlert(client, guildId, message, severity)`
Broadcast alerts to all server administrators.

**Severity Levels:**
- `info` - Blue, informational
- `warning` - Yellow, attention needed
- `error` - Red, problem occurred
- `critical` - Dark red, immediate action required

**Returns:**
```javascript
{
  success: boolean,
  successCount: number,
  failureCount: number,
  totalAdmins: number
}
```

#### `sendTestMessage(client, userId)`
Test message functionality (used by Msg Test button).

**Returns:**
```javascript
{
  success: boolean,
  response: {
    content: string,
    ephemeral: true
  }
}
```

### Utility Methods

#### `canDMUser(client, userId)`
Check if a user can receive DMs.

**Returns:** `boolean`

#### `getMessageStats()`
Get statistics about message history.

**Returns:**
```javascript
{
  totalMessages: number,
  successful: number,
  failed: number,
  successRate: string,  // e.g., "95.5%"
  byType: {
    DM: { success: number, failed: number },
    CHANNEL: { success: number, failed: number }
  }
}
```

## Usage Patterns

### In Button Handlers (app.js)
```javascript
} else if (custom_id === 'msg_test') {
  return ButtonHandlerFactory.create({
    id: 'msg_test',
    handler: async (context) => {
      const { client, userId } = context;
      const result = await DiscordMessenger.sendTestMessage(client, userId);
      return result.response;
    }
  })(req, res, client);
}
```

### In Event Handlers
```javascript
client.on('guildCreate', async (guild) => {
  await ensureServerData(guild);
  await DiscordMessenger.sendWelcomePackage(client, guild);
});
```

### For Admin Notifications
```javascript
// Critical error occurred
await DiscordMessenger.sendAdminAlert(
  client,
  guildId,
  'Database connection lost! Immediate attention required.',
  'critical'
);
```

## Message History

### Structure (messageHistory.json)
```json
[
  {
    "timestamp": "2025-08-23T10:30:00.000Z",
    "type": "DM",
    "target": "391415444084490240",
    "status": "success",
    "messageId": "1234567890",
    "executionTime": 125
  },
  {
    "timestamp": "2025-08-23T10:31:00.000Z",
    "type": "CHANNEL",
    "target": "987654321",
    "status": "failed",
    "error": "Missing permissions",
    "executionTime": 45
  }
]
```

### History Management
- Automatically rotates after 1000 entries
- Lightweight JSON storage
- Useful for debugging and analytics
- Never blocks message sending on logging failure

## Error Handling

### Graceful Degradation
```javascript
// Service never throws - always returns result
const result = await DiscordMessenger.sendDM(client, userId, message);
if (!result.success) {
  console.log(`Failed to DM: ${result.error}`);
  // Try fallback channel
  const channelResult = await DiscordMessenger.sendToChannel(
    client, 
    fallbackChannelId, 
    message
  );
}
```

### Permission Checking
- Automatically checks channel permissions before sending
- Validates user can receive DMs
- Returns clear error messages

## Components V2 Compliance

### Automatic Formatting
When passing a string, the service automatically wraps it in proper Components V2 structure:

```javascript
// You send this:
DiscordMessenger.sendDM(client, userId, "Hello!");

// Service formats as:
{
  flags: (1 << 15), // IS_COMPONENTS_V2
  components: [{
    type: 17, // Container
    components: [{
      type: 10, // Text Display
      content: "Hello!"
    }]
  }]
}
```

### Custom Components
You can also pass pre-formatted Components V2 structures:

```javascript
const customMessage = {
  flags: (1 << 15),
  components: [{
    type: 17,
    components: [
      { type: 10, content: "## Custom Header" },
      { type: 14 }, // Separator
      { type: 10, content: "Custom content" }
    ]
  }]
};

await DiscordMessenger.sendDM(client, userId, customMessage);
```

## Future Features (Documented, Not Implemented)

### Thread Support
```javascript
// FUTURE: Create and manage threads
DiscordMessenger.createThread(channelId, "Application Discussion", firstMessage);
DiscordMessenger.replyInThread(threadId, message);
DiscordMessenger.archiveThread(threadId);
```

**Use Cases:**
- Application discussion threads
- Safari event threads
- Voting discussion threads

### Scheduled Messaging
```javascript
// FUTURE: Schedule messages for later delivery
DiscordMessenger.scheduleMessage(
  { type: 'DM', target: userId },
  "Reminder: Applications close in 24 hours!",
  new Date(Date.now() + 24 * 60 * 60 * 1000)
);
```

**Implementation Notes:**
- Store in `scheduledMessages.json`
- Check every minute via cron/interval
- Support cancellation

### Rich Components V2 Templates
```javascript
// FUTURE: Pre-built rich message templates
DiscordMessenger.formatRichMessage({
  title: "Safari Event",
  sections: [
    { type: 'text', content: 'Event details...' },
    { type: 'media', images: [...] }
  ],
  buttons: [
    { label: 'Join', customId: 'join_event' }
  ]
});
```

**Note:** Embeds are legacy. All rich formatting should use Components V2 patterns.

## Best Practices

### 1. Always Pass Client
```javascript
// ✅ CORRECT: Pass client from context
const { client } = context;
await DiscordMessenger.sendDM(client, userId, message);

// ❌ WRONG: Trying to use global client
await DiscordMessenger.sendDM(globalClient, userId, message);
```

### 2. Handle Results
```javascript
// ✅ Always check success
const result = await DiscordMessenger.sendDM(client, userId, message);
if (!result.success) {
  // Handle failure appropriately
}
```

### 3. Use Templates for Consistency
```javascript
// ✅ Use predefined templates
await DiscordMessenger.sendWelcomePackage(client, guild);

// Instead of building welcome messages manually each time
```

### 4. Respect Rate Limits
The service handles basic rate limiting, but for bulk operations:
```javascript
// Space out bulk messages
for (const userId of userIds) {
  await DiscordMessenger.sendDM(client, userId, message);
  await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
}
```

## Migration Guide

### Before (Inline in app.js)
```javascript
// 20+ lines of messaging code in button handler
try {
  const user = await client.users.fetch(userId);
  await user.send('Message');
  // Error handling, logging, etc.
} catch (error) {
  // Handle error
}
```

### After (Using Service)
```javascript
// 3 lines in button handler
const { client, userId } = context;
const result = await DiscordMessenger.sendTestMessage(client, userId);
return result.response;
```

## Testing

### Manual Testing
1. Use `/menu` → Production Menu → Analytics → **Msg Test** button
2. Check DMs received
3. Review `messageHistory.json` for logging

### Monitoring
```bash
# Check message stats
tail -f messageHistory.json

# Monitor success rate
npm run logs-prod | grep "DiscordMessenger"
```

## Related Documentation

- [ButtonHandlerFactory.md](ButtonHandlerFactory.md) - Button handler patterns
- [ComponentsV2.md](../standards/ComponentsV2.md) - Discord Components V2 requirements
- [CLAUDE.md](../../CLAUDE.md) - Overall architecture principles

## Conclusion

The Discord Messenger Service provides a clean, reusable solution for all Discord messaging needs while maintaining the principle that `app.js` should only handle routing. By centralizing messaging logic, we ensure consistency, improve maintainability, and make it trivial to add new messaging features in the future.