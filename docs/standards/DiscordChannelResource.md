# Discord Channel Resource API

## Overview

Channels are **the primary interface** for CastBot's user interactions - every message, button click, and response flows through Discord channels. Understanding the Channel API is essential for managing messages, webhooks, and user communications.

CastBot heavily utilizes channel operations for Safari notifications, castlist displays, admin responses, analytics logging, and player interactions.

**Source**: [Discord Developer Documentation - Channel Resource](https://discord.com/developers/docs/resources/channel)

## 🚨 CRITICAL: CastBot Channel Patterns

### Primary Channel Operations in CastBot

1. **Message Management**: Safari updates, castlist displays, admin notifications
2. **Webhook Operations**: Follow-up messages, deferred responses
3. **Permission Management**: Application channels, private channels
4. **File Operations**: Safari maps, emoji uploads, attachment handling

## Channel Types in CastBot Context

### Text Channels (Type 0) - Primary Usage

```javascript
// CastBot's primary channel type for all communications
const GUILD_TEXT = 0;

// Standard message sending pattern
async function sendToChannel(channelId, content, options = {}) {
  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...content,
        ...options
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to send message to channel ${channelId}:`, error);
    throw error;
  }
}
```

### DM Channels (Type 1) - Limited Usage

```javascript
// CastBot occasionally uses DMs for sensitive information
async function createDMChannel(userId) {
  try {
    const response = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipient_id: userId
      })
    });

    return await response.json();
  } catch (error) {
    console.error(`Failed to create DM channel with user ${userId}:`, error);
    throw error;
  }
}
```

## Message Management Patterns

### CastBot Message Creation

```javascript
// Standard CastBot message creation with Components V2
export async function createCastBotMessage(channelId, content) {
  const messageData = {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      components: [
        {
          type: 10, // Text Display
          content: content
        }
      ]
    }]
  };

  return await sendToChannel(channelId, messageData);
}

// Enhanced message with interactive components
export async function createInteractiveMessage(channelId, content, buttons = []) {
  const components = [
    {
      type: 10, // Text Display
      content: content
    }
  ];

  if (buttons.length > 0) {
    components.push(
      { type: 14 }, // Separator
      {
        type: 1, // Action Row
        components: buttons.map(button => ({
          type: 2, // Button
          custom_id: button.id,
          label: button.label,
          style: button.style || 1,
          emoji: button.emoji ? { name: button.emoji } : undefined,
          disabled: button.disabled || false
        }))
      }
    );
  }

  const messageData = {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      components: components
    }]
  };

  return await sendToChannel(channelId, messageData);
}
```

### Message Editing (Heavy CastBot Usage)

```javascript
// CastBot message editing pattern (used extensively for Safari updates)
export async function editMessage(channelId, messageId, newContent) {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newContent)
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to edit message ${messageId} in channel ${channelId}:`, error);
    throw error;
  }
}

// Batch message editing with rate limit protection
export async function batchEditMessages(channelId, edits) {
  const results = [];

  for (const edit of edits) {
    try {
      const result = await editMessage(channelId, edit.messageId, edit.content);
      results.push({ success: true, messageId: edit.messageId, result });

      // Rate limit protection (5 requests per 5 seconds per channel)
      await sleep(1200); // 1.2 seconds between edits
    } catch (error) {
      results.push({ success: false, messageId: edit.messageId, error: error.message });
    }
  }

  return results;
}
```

### Message Deletion

```javascript
// CastBot message deletion patterns
export async function deleteMessage(channelId, messageId, reason = 'CastBot cleanup') {
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'X-Audit-Log-Reason': reason
      }
    });

    console.log(`✅ Deleted message ${messageId} from channel ${channelId}`);
  } catch (error) {
    console.error(`Failed to delete message ${messageId}:`, error);
    throw error;
  }
}

// Bulk message deletion (Discord limitation: messages must be <14 days old)
export async function bulkDeleteMessages(channelId, messageIds, reason = 'CastBot bulk cleanup') {
  if (messageIds.length < 2 || messageIds.length > 100) {
    throw new Error('Bulk delete requires 2-100 message IDs');
  }

  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/bulk-delete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Audit-Log-Reason': reason
      },
      body: JSON.stringify({
        messages: messageIds
      })
    });

    console.log(`✅ Bulk deleted ${messageIds.length} messages from channel ${channelId}`);
  } catch (error) {
    console.error(`Failed to bulk delete messages:`, error);
    throw error;
  }
}
```

## Webhook Integration Patterns

### CastBot Webhook Management

```javascript
// CastBot webhook creation and management
export async function createChannelWebhook(channelId, name, avatar = null) {
  try {
    const webhookData = {
      name: name,
      avatar: avatar // Base64 encoded image or null
    };

    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/webhooks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookData)
    });

    const webhook = await response.json();
    console.log(`✅ Created webhook ${webhook.name} (${webhook.id}) in channel ${channelId}`);

    return webhook;
  } catch (error) {
    console.error(`Failed to create webhook in channel ${channelId}:`, error);
    throw error;
  }
}

// Execute webhook (for external integrations)
export async function executeWebhook(webhookId, token, content) {
  try {
    const response = await fetch(`https://discord.com/api/v10/webhooks/${webhookId}/${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(content)
    });

    return await response.json();
  } catch (error) {
    console.error(`Failed to execute webhook ${webhookId}:`, error);
    throw error;
  }
}
```

### Interaction Follow-up via Webhooks

```javascript
// CastBot interaction follow-up pattern (used heavily)
export async function sendFollowupMessage(interactionToken, content, ephemeral = false) {
  try {
    const messageData = {
      ...content,
      flags: ephemeral ? InteractionResponseFlags.EPHEMERAL : undefined
    };

    const response = await fetch(
      `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${interactionToken}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messageData)
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to send follow-up message:', error);
    throw error;
  }
}

// Edit original interaction response
export async function editOriginalResponse(interactionToken, content) {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${interactionToken}/messages/@original`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(content)
      }
    );

    return await response.json();
  } catch (error) {
    console.error('Failed to edit original response:', error);
    throw error;
  }
}
```

## File Upload Patterns

### CastBot File Upload (Safari Maps, Emojis)

```javascript
// CastBot file upload pattern (used for Safari maps and emoji uploads)
export async function uploadFile(channelId, fileBuffer, filename, content = null) {
  try {
    const formData = new FormData();

    // Add file
    const blob = new Blob([fileBuffer]);
    formData.append('files[0]', blob, filename);

    // Add message content if provided
    if (content) {
      formData.append('payload_json', JSON.stringify(content));
    }

    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
        // Note: Don't set Content-Type header for FormData
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const message = await response.json();
    console.log(`✅ Uploaded file ${filename} to channel ${channelId}`);

    return {
      message,
      attachmentUrl: message.attachments[0]?.url
    };
  } catch (error) {
    console.error(`Failed to upload file ${filename}:`, error);
    throw error;
  }
}

// Upload with Components V2 message
export async function uploadFileWithMessage(channelId, fileBuffer, filename, messageContent) {
  const content = {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      components: [
        {
          type: 10, // Text Display
          content: messageContent
        },
        { type: 14 }, // Separator
        {
          type: 13, // File component
          file: { url: `attachment://${filename}` }
        }
      ]
    }]
  };

  return await uploadFile(channelId, fileBuffer, filename, content);
}
```

### Attachment Handling

```javascript
// CastBot attachment processing (used for Safari map uploads)
export async function processAttachment(attachment) {
  try {
    // Download attachment
    const response = await fetch(attachment.url);
    const buffer = await response.arrayBuffer();

    // Validate file type and size
    const validImageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    const maxSize = 8 * 1024 * 1024; // 8MB

    if (!validImageTypes.includes(attachment.content_type)) {
      throw new Error(`Invalid file type: ${attachment.content_type}. Supported: ${validImageTypes.join(', ')}`);
    }

    if (buffer.byteLength > maxSize) {
      throw new Error(`File too large: ${buffer.byteLength} bytes. Max: ${maxSize} bytes`);
    }

    return {
      buffer: new Uint8Array(buffer),
      filename: attachment.filename,
      contentType: attachment.content_type,
      size: buffer.byteLength,
      url: attachment.url
    };
  } catch (error) {
    console.error(`Failed to process attachment ${attachment.filename}:`, error);
    throw error;
  }
}

// Extract attachments from message
export async function extractMessageAttachments(message) {
  const attachments = [];

  for (const attachment of message.attachments) {
    try {
      const processed = await processAttachment(attachment);
      attachments.push(processed);
    } catch (error) {
      console.error(`Failed to process attachment ${attachment.filename}:`, error);
      // Continue with other attachments
    }
  }

  return attachments;
}
```

## Channel Permission Management

### CastBot Channel Permission Patterns

```javascript
// CastBot channel permission management (application channels, etc.)
export async function updateChannelPermissions(channelId, targetId, permissions, reason = 'CastBot permission update') {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/permissions/${targetId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Audit-Log-Reason': reason
        },
        body: JSON.stringify({
          type: permissions.type, // 0 = role, 1 = member
          allow: permissions.allow?.toString(),
          deny: permissions.deny?.toString()
        })
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    console.log(`✅ Updated permissions for ${targetId} in channel ${channelId}`);
  } catch (error) {
    console.error(`Failed to update channel permissions:`, error);
    throw error;
  }
}

// Grant application access (used in applicationManager.js)
export async function grantApplicationAccess(channelId, userId) {
  const permissions = {
    type: 1, // Member
    allow:
      PermissionFlagsBits.ViewChannel |
      PermissionFlagsBits.SendMessages |
      PermissionFlagsBits.ReadMessageHistory |
      PermissionFlagsBits.AddReactions,
    deny: 0n
  };

  await updateChannelPermissions(channelId, userId, permissions, 'Grant application access');
}

// Remove access
export async function revokeChannelAccess(channelId, userId) {
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/permissions/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'X-Audit-Log-Reason': 'CastBot access revocation'
      }
    });

    console.log(`✅ Revoked access for ${userId} in channel ${channelId}`);
  } catch (error) {
    console.error(`Failed to revoke channel access:`, error);
    throw error;
  }
}
```

## Message History Management

### CastBot Message Fetching

```javascript
// CastBot message history patterns
export async function getChannelMessages(channelId, options = {}) {
  try {
    const params = new URLSearchParams();

    if (options.limit) params.append('limit', options.limit);
    if (options.before) params.append('before', options.before);
    if (options.after) params.append('after', options.after);
    if (options.around) params.append('around', options.around);

    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages?${params}`,
      {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch messages from channel ${channelId}:`, error);
    throw error;
  }
}

// Find CastBot's messages in channel
export async function findBotMessages(channelId, limit = 50) {
  try {
    const messages = await getChannelMessages(channelId, { limit });
    const botMessages = messages.filter(msg => msg.author.id === process.env.APP_ID);

    return botMessages;
  } catch (error) {
    console.error(`Failed to find bot messages in channel ${channelId}:`, error);
    throw error;
  }
}

// Clean up old CastBot messages
export async function cleanupOldMessages(channelId, maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days
  try {
    const botMessages = await findBotMessages(channelId, 100);
    const oldMessages = botMessages.filter(msg => {
      const messageAge = Date.now() - new Date(msg.timestamp).getTime();
      return messageAge > maxAge;
    });

    if (oldMessages.length === 0) {
      console.log(`No old messages to clean up in channel ${channelId}`);
      return;
    }

    // Delete messages individually (bulk delete has 14-day limit)
    for (const message of oldMessages) {
      try {
        await deleteMessage(channelId, message.id, 'CastBot automated cleanup');
        await sleep(1000); // Rate limit protection
      } catch (error) {
        console.error(`Failed to delete message ${message.id}:`, error);
      }
    }

    console.log(`✅ Cleaned up ${oldMessages.length} old messages in channel ${channelId}`);
  } catch (error) {
    console.error(`Failed to cleanup messages in channel ${channelId}:`, error);
    throw error;
  }
}
```

## Analytics and Logging Integration

### CastBot Channel Analytics

```javascript
// CastBot channel analytics patterns (from src/analytics/)
export class ChannelAnalytics {
  constructor() {
    this.messageStats = new Map();
    this.interactionStats = new Map();
  }

  recordMessage(channelId, messageType, metadata = {}) {
    const key = `${channelId}_${messageType}`;
    const stats = this.messageStats.get(key) || {
      count: 0,
      firstSeen: Date.now(),
      lastSeen: Date.now()
    };

    stats.count++;
    stats.lastSeen = Date.now();
    stats.metadata = { ...stats.metadata, ...metadata };

    this.messageStats.set(key, stats);
  }

  recordInteraction(channelId, interactionType, customId) {
    const key = `${channelId}_${interactionType}_${customId}`;
    const stats = this.interactionStats.get(key) || { count: 0, lastUsed: Date.now() };

    stats.count++;
    stats.lastUsed = Date.now();

    this.interactionStats.set(key, stats);
  }

  getChannelReport(channelId) {
    const messages = Array.from(this.messageStats.entries())
      .filter(([key]) => key.startsWith(channelId))
      .map(([key, stats]) => ({
        type: key.split('_')[1],
        ...stats
      }));

    const interactions = Array.from(this.interactionStats.entries())
      .filter(([key]) => key.startsWith(channelId))
      .map(([key, stats]) => ({
        type: key.split('_')[1],
        customId: key.split('_')[2],
        ...stats
      }));

    return { messages, interactions };
  }
}
```

## Error Handling Patterns

### Channel-Specific Error Handling

```javascript
// CastBot channel error handling patterns
export async function handleChannelError(error, operation, channelId) {
  const errorCode = error.code || error.status;
  const errorMessage = error.message;

  switch (errorCode) {
    case 10003: // Unknown Channel
      console.error(`Channel ${channelId} not found or deleted`);
      await handleChannelDeletion(channelId);
      break;

    case 50001: // Missing Access
      console.error(`Missing access to channel ${channelId}`);
      await notifyAdminsAboutChannelAccess(channelId);
      break;

    case 50013: // Missing Permissions
      console.error(`Missing permissions for ${operation} in channel ${channelId}`);
      await requestChannelPermissions(channelId, operation);
      break;

    case 50035: // Invalid Form Body
      console.error(`Invalid message format for ${operation}:`, error.errors);
      break;

    case 40005: // Request entity too large
      console.error(`Message/file too large for ${operation} in channel ${channelId}`);
      break;

    case 50006: // Cannot send empty message
      console.error(`Attempted to send empty message to channel ${channelId}`);
      break;

    case 30003: // Maximum pins reached
      console.error(`Cannot pin message in channel ${channelId}: Maximum pins reached`);
      break;

    case 30008: // Maximum reactions reached
      console.error(`Cannot add reaction in channel ${channelId}: Maximum reactions reached`);
      break;

    default:
      console.error(`Unknown channel error during ${operation}:`, {
        channelId,
        code: errorCode,
        message: errorMessage
      });
  }

  throw error; // Re-throw for upstream handling
}

// Channel operation with automatic retry
export async function channelOperationWithRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      const shouldRetry = [429, 500, 502, 503, 504].includes(error.status);
      if (!shouldRetry) {
        throw error;
      }

      const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
      console.log(`⚠️ Channel operation failed (attempt ${attempt}), retrying in ${waitTime}ms...`);
      await sleep(waitTime);
    }
  }
}
```

## Best Practices for CastBot Channel Operations

### 1. Always Use Components V2 for Messages
```javascript
// ✅ Correct - Components V2 structure
const message = {
  flags: (1 << 15), // IS_COMPONENTS_V2
  components: [{
    type: 17, // Container
    components: [
      { type: 10, content: "Message content" }
    ]
  }]
};

// ❌ Wrong - Legacy content field
const message = {
  content: "Message content",
  flags: (1 << 15) // Will fail with content field
};
```

### 2. Handle File Uploads Properly
```javascript
// ✅ Correct - FormData for file uploads
const formData = new FormData();
formData.append('files[0]', blob, filename);
formData.append('payload_json', JSON.stringify(content));

// ❌ Wrong - JSON for file uploads
const body = JSON.stringify({ content, file: base64File });
```

### 3. Respect Channel Rate Limits
```javascript
// ✅ Correct - Rate limit protection
for (const message of messages) {
  await sendToChannel(channelId, message);
  await sleep(1200); // 5 messages per 5 seconds = 1200ms between
}

// ❌ Wrong - No rate limit protection
await Promise.all(messages.map(msg => sendToChannel(channelId, msg)));
```

### 4. Use Interaction Endpoints for Responses
```javascript
// ✅ Correct - Use interaction response (not rate limited)
await fetch(`/interactions/${id}/${token}/callback`, options);

// ❌ Less efficient - Regular channel message (rate limited)
await fetch(`/channels/${channelId}/messages`, options);
```

## Channel-Specific CastBot Features

### Safari Channel Integration
```javascript
// Safari-specific channel operations
export async function sendSafariUpdate(channelId, safariData) {
  const content = `## 🦁 Safari Update\n\nRound ${safariData.round} results are available!`;

  const message = {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      components: [
        { type: 10, content },
        { type: 14 }, // Separator
        {
          type: 1, // Action Row
          components: [{
            type: 2, // Button
            custom_id: `safari_view_results_${safariData.round}`,
            label: "View Results",
            style: 1,
            emoji: { name: "📊" }
          }]
        }
      ]
    }]
  };

  return await sendToChannel(channelId, message);
}
```

### Castlist Channel Display
```javascript
// Castlist channel display
export async function displayCastlist(channelId, castlistData) {
  const content = `## 🎭 ${castlistData.season.name}\n\n${castlistData.formattedList}`;

  const message = {
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [{
      type: 17, // Container
      accent_color: 0x5865f2,
      components: [
        { type: 10, content },
        { type: 14 }, // Separator
        {
          type: 1, // Action Row
          components: [{
            type: 2, // Button
            custom_id: `castlist_refresh_${castlistData.season.id}`,
            label: "Refresh",
            style: 2,
            emoji: { name: "🔄" }
          }]
        }
      ]
    }]
  };

  return await sendToChannel(channelId, message);
}
```

## Related Documentation

- **[Discord Interaction API](DiscordInteractionAPI.md)** - Interaction response channels
- **[Discord Webhook Resource](DiscordWebhookResource.md)** - Webhook-based messaging
- **[Discord Message Resource](DiscordMessageResource.md)** - Message object details
- **[Discord Rate Limits](DiscordRateLimits.md)** - Channel-specific rate limits

## References

- [Discord Channel Resource Documentation](https://discord.com/developers/docs/resources/channel)
- [Channel Message Endpoints](https://discord.com/developers/docs/resources/channel#create-message)
- [File Upload Guidelines](https://discord.com/developers/docs/reference#uploading-files)