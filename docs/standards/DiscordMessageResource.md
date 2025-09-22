# Discord Message Resource API

## Overview

Messages are **the core data structure** for all CastBot communications - every interaction, response, and update involves message objects. Understanding message structure, embeds, and attachments is essential for effective CastBot development.

CastBot extensively uses message editing for Safari updates, embed creation for analytics, and attachment handling for maps and images.

**Source**: [Discord Developer Documentation - Message Resource](https://discord.com/developers/docs/resources/message)

## 🚨 CRITICAL: CastBot Message Patterns

### CastBot Message Architecture

1. **Components V2 Messages**: All CastBot UI uses Container + Component structure
2. **Embed Usage**: Analytics, server stats, error reporting, castlists
3. **Attachment Handling**: Safari maps, emoji uploads, file processing
4. **Message Editing**: Real-time Safari updates, anchor message management

## Message Object Structure

### Core Message Properties

```javascript
// Discord message object structure
{
  id: "snowflake",                    // Message ID
  type: 0,                           // Message type (0 = default)
  content: "string",                 // Text content (AVOID with Components V2)
  channel_id: "snowflake",           // Channel where message was sent
  author: {                          // User who sent message
    id: "snowflake",
    username: "string",
    discriminator: "string",
    avatar: "string"
  },
  attachments: [],                   // File attachments
  embeds: [],                        // Rich embeds
  mentions: [],                      // User mentions
  mention_roles: [],                 // Role mentions
  pinned: false,                     // Whether message is pinned
  mention_everyone: false,           // Whether @everyone was used
  tts: false,                        // Text-to-speech
  timestamp: "ISO8601",              // When message was sent
  edited_timestamp: "ISO8601",       // When message was last edited
  flags: 0,                          // Message flags bitfield
  components: [],                    // Message components (Components V2)
  reactions: [],                     // Message reactions
  nonce: "string",                   // Message nonce for deduplication
  webhook_id: "snowflake"            // Webhook ID if sent via webhook
}
```

### CastBot Message Creation Pattern

```javascript
// Standard CastBot message creation (Components V2)
export function createCastBotMessage(content, options = {}) {
  const message = {
    flags: (1 << 15), // IS_COMPONENTS_V2 (required for CastBot)
    components: [{
      type: 17, // Container
      accent_color: options.accentColor || null,
      components: [
        {
          type: 10, // Text Display
          content: content
        }
      ]
    }]
  };

  // Add components if provided
  if (options.components) {
    message.components[0].components.push(
      { type: 14 }, // Separator
      ...options.components
    );
  }

  // Add ephemeral flag if needed
  if (options.ephemeral) {
    message.flags |= InteractionResponseFlags.EPHEMERAL;
  }

  return message;
}

// Example usage throughout CastBot
const safariMessage = createCastBotMessage(
  "## 🦁 Safari Update\n\nRound 5 results are ready!",
  {
    accentColor: 0x5865f2,
    components: [{
      type: 1, // Action Row
      components: [{
        type: 2, // Button
        custom_id: "safari_view_results",
        label: "View Results",
        style: 1
      }]
    }]
  }
);
```

## Embed Patterns (CastBot Usage)

### CastBot Embed Creation

```javascript
// CastBot embed patterns (used for analytics, error reporting)
export function createCastBotEmbed(options) {
  const embed = {
    title: options.title,
    description: options.description,
    color: options.color || 0x5865f2, // CastBot blue
    timestamp: options.timestamp || new Date().toISOString(),
    footer: {
      text: options.footerText || "CastBot",
      icon_url: options.footerIcon || null
    }
  };

  // Add fields if provided
  if (options.fields) {
    embed.fields = options.fields.map(field => ({
      name: field.name,
      value: field.value,
      inline: field.inline || false
    }));
  }

  // Add thumbnail if provided
  if (options.thumbnail) {
    embed.thumbnail = { url: options.thumbnail };
  }

  // Add image if provided
  if (options.image) {
    embed.image = { url: options.image };
  }

  return embed;
}
```

### Analytics Embed Pattern

From `src/analytics/serverUsageAnalytics.js`:

```javascript
// CastBot analytics embed pattern
export function createAnalyticsEmbed(guildData) {
  const embed = createCastBotEmbed({
    title: "📊 Server Usage Analytics",
    description: `Analytics for **${guildData.guildName}**`,
    color: 0x2ecc71, // Green for analytics
    fields: [
      {
        name: "👥 Members",
        value: `${guildData.memberCount} total\n${guildData.activeMembersToday} active today`,
        inline: true
      },
      {
        name: "💬 Messages",
        value: `${guildData.messagesTotal} total\n${guildData.messagesToday} today`,
        inline: true
      },
      {
        name: "🎮 Commands",
        value: `${guildData.commandsTotal} total\n${guildData.commandsToday} today`,
        inline: true
      },
      {
        name: "🦁 Safari Activity",
        value: guildData.safariActive ? "Active" : "Inactive",
        inline: true
      },
      {
        name: "📋 Castlists",
        value: `${guildData.castlistCount} configured`,
        inline: true
      },
      {
        name: "⚡ Response Time",
        value: `${guildData.avgResponseTime}ms average`,
        inline: true
      }
    ],
    timestamp: new Date().toISOString()
  });

  return {
    embeds: [embed]
  };
}
```

### Error Reporting Embed

```javascript
// CastBot error reporting embed
export function createErrorEmbed(error, context = {}) {
  const embed = createCastBotEmbed({
    title: "🚨 Error Report",
    description: "An error occurred during operation",
    color: 0xe74c3c, // Red for errors
    fields: [
      {
        name: "Error Message",
        value: `\`\`\`\n${error.message}\n\`\`\``,
        inline: false
      },
      {
        name: "Error Code",
        value: error.code || "Unknown",
        inline: true
      },
      {
        name: "Timestamp",
        value: new Date().toLocaleString(),
        inline: true
      }
    ]
  });

  // Add context if provided
  if (context.guildId) {
    embed.fields.push({
      name: "Guild ID",
      value: context.guildId,
      inline: true
    });
  }

  if (context.channelId) {
    embed.fields.push({
      name: "Channel ID",
      value: context.channelId,
      inline: true
    });
  }

  if (context.userId) {
    embed.fields.push({
      name: "User ID",
      value: context.userId,
      inline: true
    });
  }

  // Add stack trace for debugging (truncated)
  if (error.stack) {
    const truncatedStack = error.stack.slice(0, 1000);
    embed.fields.push({
      name: "Stack Trace",
      value: `\`\`\`\n${truncatedStack}\n\`\`\``,
      inline: false
    });
  }

  return {
    embeds: [embed]
  };
}
```

### Castlist Embed Pattern

```javascript
// CastBot castlist embed
export function createCastlistEmbed(castlistData) {
  const embed = createCastBotEmbed({
    title: `🎭 ${castlistData.season.name}`,
    description: castlistData.season.description || "Current castlist",
    color: castlistData.season.color || 0x9b59b6, // Purple for castlists
    thumbnail: castlistData.season.logo || null,
    fields: []
  });

  // Add cast members by placement
  const placements = castlistData.placements || {};

  for (const [placement, members] of Object.entries(placements)) {
    if (members.length > 0) {
      const membersList = members.map(member => {
        const emoji = member.eliminated ? "❌" : "✅";
        return `${emoji} ${member.displayName}`;
      }).join("\n");

      embed.fields.push({
        name: `${placement} (${members.length})`,
        value: membersList,
        inline: true
      });
    }
  }

  // Add statistics
  if (castlistData.stats) {
    embed.fields.push({
      name: "📊 Statistics",
      value: [
        `Total Cast: ${castlistData.stats.totalCast}`,
        `Eliminated: ${castlistData.stats.eliminated}`,
        `Remaining: ${castlistData.stats.remaining}`,
        `Days Running: ${castlistData.stats.daysRunning}`
      ].join("\n"),
      inline: false
    });
  }

  return {
    embeds: [embed]
  };
}
```

## Attachment Handling Patterns

### CastBot Attachment Processing

```javascript
// CastBot attachment processing (Safari maps, emoji uploads)
export async function processMessageAttachment(attachment) {
  try {
    // Validate attachment
    const validationResult = validateAttachment(attachment);
    if (!validationResult.valid) {
      throw new Error(validationResult.error);
    }

    // Download attachment
    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(`Failed to download attachment: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    return {
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.content_type,
      size: attachment.size,
      buffer: buffer,
      url: attachment.url,
      proxyUrl: attachment.proxy_url,
      width: attachment.width,
      height: attachment.height
    };
  } catch (error) {
    console.error(`Failed to process attachment ${attachment.filename}:`, error);
    throw error;
  }
}

// Attachment validation
function validateAttachment(attachment) {
  const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB
  const ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

  if (attachment.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large: ${attachment.size} bytes (max: ${MAX_FILE_SIZE})`
    };
  }

  if (attachment.content_type && !ALLOWED_IMAGE_TYPES.includes(attachment.content_type)) {
    return {
      valid: false,
      error: `Invalid file type: ${attachment.content_type}`
    };
  }

  return { valid: true };
}
```

### Safari Map Handling

```javascript
// Safari map attachment handling (from codebase patterns)
export async function processSafariMapUpload(message) {
  try {
    if (message.attachments.length === 0) {
      throw new Error('No attachments found in message');
    }

    const mapAttachment = message.attachments[0]; // Take first attachment
    const processedAttachment = await processMessageAttachment(mapAttachment);

    // Validate it's an image
    if (!processedAttachment.contentType.startsWith('image/')) {
      throw new Error('Safari maps must be image files');
    }

    // Store map data
    const mapData = {
      messageId: message.id,
      channelId: message.channel_id,
      filename: processedAttachment.filename,
      url: processedAttachment.url,
      proxyUrl: processedAttachment.proxyUrl,
      width: processedAttachment.width,
      height: processedAttachment.height,
      uploadedAt: new Date(message.timestamp).getTime(),
      uploadedBy: message.author.id
    };

    console.log(`✅ Processed Safari map: ${mapData.filename} (${mapData.width}x${mapData.height})`);
    return mapData;
  } catch (error) {
    console.error('Failed to process Safari map upload:', error);
    throw error;
  }
}
```

### Emoji Upload Processing

```javascript
// Emoji attachment processing (from utils/emojiUtils.js patterns)
export async function processEmojiUpload(attachment, emojiName) {
  try {
    const processedAttachment = await processMessageAttachment(attachment);

    // Additional validation for emojis
    if (processedAttachment.size > 256 * 1024) { // 256KB limit for emojis
      throw new Error('Emoji file too large (max 256KB)');
    }

    if (!['image/png', 'image/jpeg', 'image/gif'].includes(processedAttachment.contentType)) {
      throw new Error('Emoji must be PNG, JPEG, or GIF');
    }

    // Process emoji name
    const processedName = emojiName
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    if (processedName.length < 2 || processedName.length > 32) {
      throw new Error('Emoji name must be 2-32 characters (letters, numbers, underscores)');
    }

    return {
      name: processedName,
      buffer: processedAttachment.buffer,
      contentType: processedAttachment.contentType,
      originalFilename: processedAttachment.filename
    };
  } catch (error) {
    console.error(`Failed to process emoji upload for ${emojiName}:`, error);
    throw error;
  }
}
```

## Message Editing Patterns (Heavy CastBot Usage)

### CastBot Message Update System

```javascript
// CastBot message editing pattern (used extensively for Safari updates)
export class MessageUpdateManager {
  constructor() {
    this.updateQueue = new Map();
    this.rateLimiter = new Map();
  }

  async scheduleUpdate(channelId, messageId, newContent, delay = 0) {
    const key = `${channelId}_${messageId}`;

    // Clear existing update if scheduled
    if (this.updateQueue.has(key)) {
      clearTimeout(this.updateQueue.get(key).timer);
    }

    // Schedule new update
    const timer = setTimeout(async () => {
      try {
        await this.executeUpdate(channelId, messageId, newContent);
      } catch (error) {
        console.error(`Failed to update message ${messageId}:`, error);
      } finally {
        this.updateQueue.delete(key);
      }
    }, delay);

    this.updateQueue.set(key, { timer, content: newContent });
  }

  async executeUpdate(channelId, messageId, content) {
    // Rate limit protection (5 edits per 5 seconds per channel)
    await this.respectRateLimit(channelId);

    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(content)
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  }

  async respectRateLimit(channelId) {
    const now = Date.now();
    const limiter = this.rateLimiter.get(channelId) || { requests: [], limit: 5, window: 5000 };

    // Remove old requests outside the window
    limiter.requests = limiter.requests.filter(time => now - time < limiter.window);

    // Check if at limit
    if (limiter.requests.length >= limiter.limit) {
      const oldestRequest = limiter.requests[0];
      const waitTime = limiter.window - (now - oldestRequest);
      console.log(`⏳ Message edit rate limit: waiting ${waitTime}ms for channel ${channelId}`);
      await sleep(waitTime);
      return this.respectRateLimit(channelId); // Recursive check
    }

    // Record this request
    limiter.requests.push(now);
    this.rateLimiter.set(channelId, limiter);
  }
}

// Global instance for CastBot
export const messageUpdateManager = new MessageUpdateManager();
```

### Anchor Message Management

From `anchorMessageManager.js` patterns:

```javascript
// CastBot anchor message management
export async function updateAnchorMessage(channelId, messageId, newData) {
  try {
    // Create updated message content
    const updatedContent = createCastBotMessage(newData.content, {
      components: newData.components,
      accentColor: newData.accentColor
    });

    // Schedule batched update to prevent rate limiting
    await messageUpdateManager.scheduleUpdate(channelId, messageId, updatedContent, 1000);

    console.log(`✅ Scheduled anchor message update: ${messageId}`);
  } catch (error) {
    console.error(`Failed to update anchor message ${messageId}:`, error);
    throw error;
  }
}

// Batch update multiple anchor messages
export async function batchUpdateAnchorMessages(updates) {
  console.log(`📝 Batching ${updates.length} anchor message updates...`);

  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    const delay = i * 1200; // 1.2 seconds between updates

    await messageUpdateManager.scheduleUpdate(
      update.channelId,
      update.messageId,
      update.content,
      delay
    );
  }

  console.log(`✅ Scheduled ${updates.length} batched updates`);
}
```

## Message Flags and Properties

### CastBot Message Flags

```javascript
// Discord message flags used by CastBot
export const MessageFlags = {
  CROSSPOSTED: 1 << 0,                    // Message has been crossposted
  IS_CROSSPOST: 1 << 1,                   // Message is a crosspost
  SUPPRESS_EMBEDS: 1 << 2,                // Do not include embeds
  SOURCE_MESSAGE_DELETED: 1 << 3,         // Source message for crosspost deleted
  URGENT: 1 << 4,                         // Message is urgent
  HAS_THREAD: 1 << 5,                     // Message has thread
  EPHEMERAL: 1 << 6,                      // Message is ephemeral (slash command responses)
  LOADING: 1 << 7,                        // Message is loading
  FAILED_TO_MENTION_SOME_ROLES_IN_THREAD: 1 << 8, // Failed to mention roles in thread
  SUPPRESS_NOTIFICATIONS: 1 << 12,        // Do not trigger push/desktop notifications
  IS_VOICE_MESSAGE: 1 << 13,              // Message is voice message
  IS_COMPONENTS_V2: 1 << 15               // Message uses Components V2 (REQUIRED for CastBot)
};

// CastBot standard flags
export const CASTBOT_MESSAGE_FLAGS = MessageFlags.IS_COMPONENTS_V2;
export const CASTBOT_EPHEMERAL_FLAGS = MessageFlags.IS_COMPONENTS_V2 | MessageFlags.EPHEMERAL;
```

### Message Type Handling

```javascript
// Handle different message types in CastBot context
export function getMessageTypeInfo(message) {
  const typeMap = {
    0: 'DEFAULT',                  // Regular message
    1: 'RECIPIENT_ADD',           // User added to group DM
    2: 'RECIPIENT_REMOVE',        // User removed from group DM
    3: 'CALL',                    // Voice/video call
    4: 'CHANNEL_NAME_CHANGE',     // Channel name changed
    5: 'CHANNEL_ICON_CHANGE',     // Channel icon changed
    6: 'CHANNEL_PINNED_MESSAGE',  // Message pinned
    7: 'USER_JOIN',               // User joined server
    8: 'GUILD_BOOST',             // Server boost
    9: 'GUILD_BOOST_TIER_1',      // Server boost tier 1
    10: 'GUILD_BOOST_TIER_2',     // Server boost tier 2
    11: 'GUILD_BOOST_TIER_3',     // Server boost tier 3
    12: 'CHANNEL_FOLLOW_ADD',     // Channel follow added
    19: 'REPLY',                  // Reply to message
    20: 'CHAT_INPUT_COMMAND',     // Slash command
    21: 'THREAD_STARTER_MESSAGE', // Thread starter
    22: 'GUILD_INVITE_REMINDER',  // Guild invite reminder
    23: 'CONTEXT_MENU_COMMAND',   // Context menu command
    24: 'AUTO_MODERATION_ACTION'  // AutoMod action
  };

  return {
    type: message.type,
    typeName: typeMap[message.type] || 'UNKNOWN',
    isCommand: [20, 23].includes(message.type),
    isSystemMessage: message.type !== 0,
    isReply: message.type === 19,
    isThread: message.type === 21
  };
}
```

## Message Mentions and References

### CastBot Mention Handling

```javascript
// Handle mentions in CastBot messages
export function processMentions(message) {
  const mentions = {
    users: message.mentions.map(user => ({
      id: user.id,
      username: user.username,
      displayName: user.global_name || user.username,
      mention: `<@${user.id}>`
    })),
    roles: message.mention_roles.map(roleId => ({
      id: roleId,
      mention: `<@&${roleId}>`
    })),
    channels: (message.content.match(/<#(\d+)>/g) || []).map(match => {
      const id = match.slice(2, -1);
      return {
        id: id,
        mention: `<#${id}>`
      };
    }),
    everyone: message.mention_everyone,
    here: message.content.includes('@here')
  };

  return mentions;
}

// Create safe mentions for CastBot responses
export function createSafeMention(userId, allowMention = false) {
  if (allowMention) {
    return `<@${userId}>`;
  } else {
    return `<@!${userId}>`; // Nickname mention (less intrusive)
  }
}

// Format user list with mentions
export function formatUserMentions(userIds, options = {}) {
  const mentionType = options.allowMentions ? '@' : '@!';
  const maxUsers = options.maxUsers || 10;

  const mentions = userIds.slice(0, maxUsers).map(id => `<${mentionType}${id}>`);

  if (userIds.length > maxUsers) {
    mentions.push(`and ${userIds.length - maxUsers} more...`);
  }

  return mentions.join(', ');
}
```

### Message References (Replies)

```javascript
// Handle message references and replies
export function createMessageReference(originalMessageId, channelId, guildId = null) {
  return {
    message_id: originalMessageId,
    channel_id: channelId,
    guild_id: guildId,
    fail_if_not_exists: false // Don't fail if original message is deleted
  };
}

// Reply to a message with CastBot format
export async function replyToMessage(channelId, originalMessageId, content, options = {}) {
  const message = createCastBotMessage(content, options);

  // Add message reference for reply
  message.message_reference = createMessageReference(originalMessageId, channelId, options.guildId);

  // Send reply
  return await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(message)
  });
}
```

## Message Search and Filtering

### CastBot Message Analysis

```javascript
// Search and analyze messages for CastBot features
export class MessageAnalyzer {
  constructor() {
    this.patterns = {
      commands: /^[\/!](\w+)/,
      mentions: /<@!?(\d+)>/g,
      channels: /<#(\d+)>/g,
      roles: /<@&(\d+)>/g,
      emojis: /<(a?):(\w+):(\d+)>/g,
      urls: /https?:\/\/[^\s]+/g
    };
  }

  analyzeMessage(message) {
    const content = message.content || '';
    const analysis = {
      messageId: message.id,
      channelId: message.channel_id,
      authorId: message.author.id,
      timestamp: new Date(message.timestamp).getTime(),
      edited: !!message.edited_timestamp,

      // Content analysis
      length: content.length,
      wordCount: content.split(/\s+/).filter(word => word.length > 0).length,

      // Pattern matches
      commands: this.extractCommands(content),
      mentions: this.extractMentions(content),
      channels: this.extractChannels(content),
      roles: this.extractRoles(content),
      emojis: this.extractEmojis(content),
      urls: this.extractUrls(content),

      // Message properties
      hasAttachments: message.attachments.length > 0,
      hasEmbeds: message.embeds.length > 0,
      hasComponents: message.components && message.components.length > 0,
      isPinned: message.pinned,
      hasReactions: message.reactions && message.reactions.length > 0,

      // Flags
      isEphemeral: !!(message.flags & MessageFlags.EPHEMERAL),
      isComponentsV2: !!(message.flags & MessageFlags.IS_COMPONENTS_V2),
      suppressEmbeds: !!(message.flags & MessageFlags.SUPPRESS_EMBEDS)
    };

    return analysis;
  }

  extractCommands(content) {
    const match = content.match(this.patterns.commands);
    return match ? [{ command: match[1], fullMatch: match[0] }] : [];
  }

  extractMentions(content) {
    const matches = Array.from(content.matchAll(this.patterns.mentions));
    return matches.map(match => ({ userId: match[1], mention: match[0] }));
  }

  extractChannels(content) {
    const matches = Array.from(content.matchAll(this.patterns.channels));
    return matches.map(match => ({ channelId: match[1], mention: match[0] }));
  }

  extractRoles(content) {
    const matches = Array.from(content.matchAll(this.patterns.roles));
    return matches.map(match => ({ roleId: match[1], mention: match[0] }));
  }

  extractEmojis(content) {
    const matches = Array.from(content.matchAll(this.patterns.emojis));
    return matches.map(match => ({
      animated: !!match[1],
      name: match[2],
      id: match[3],
      mention: match[0]
    }));
  }

  extractUrls(content) {
    const matches = Array.from(content.matchAll(this.patterns.urls));
    return matches.map(match => ({ url: match[0] }));
  }
}

// Global analyzer instance
export const messageAnalyzer = new MessageAnalyzer();
```

## Best Practices for CastBot Message Operations

### 1. Always Use Components V2
```javascript
// ✅ Correct - Components V2 with Container structure
const message = {
  flags: (1 << 15), // IS_COMPONENTS_V2
  components: [{
    type: 17, // Container
    components: [
      { type: 10, content: "Message content" }
    ]
  }]
};

// ❌ Wrong - Legacy content field with Components V2
const message = {
  content: "Message content",
  flags: (1 << 15) // Will fail
};
```

### 2. Handle Message Editing Safely
```javascript
// ✅ Correct - Rate limited message editing
await messageUpdateManager.scheduleUpdate(channelId, messageId, content, 1000);

// ❌ Wrong - Immediate uncontrolled editing
await editMessage(channelId, messageId, content);
```

### 3. Process Attachments Securely
```javascript
// ✅ Correct - Validate before processing
const validation = validateAttachment(attachment);
if (!validation.valid) {
  throw new Error(validation.error);
}
const processed = await processMessageAttachment(attachment);

// ❌ Wrong - Process without validation
const buffer = await fetch(attachment.url).then(r => r.arrayBuffer());
```

### 4. Use Embeds for Rich Content
```javascript
// ✅ Correct - Use embeds for structured data
const embed = createCastBotEmbed({
  title: "Statistics",
  fields: [{ name: "Count", value: "42", inline: true }]
});

// ❌ Wrong - Plain text for structured data
const content = "Statistics\nCount: 42";
```

## Related Documentation

- **[Discord Interaction API](DiscordInteractionAPI.md)** - Message-based interactions
- **[Discord Channel Resource](DiscordChannelResource.md)** - Channel-specific messaging
- **[Components V2](ComponentsV2.md)** - Message component structure
- **[Discord Rate Limits](DiscordRateLimits.md)** - Message operation rate limits

## References

- [Discord Message Resource Documentation](https://discord.com/developers/docs/resources/message)
- [Message Formatting Guide](https://discord.com/developers/docs/reference#message-formatting)
- [Embed Object Documentation](https://discord.com/developers/docs/resources/channel#embed-object)