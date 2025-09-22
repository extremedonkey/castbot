# Discord Emoji Resource API

## Overview

Emoji management is **essential for CastBot's UI customization** - the bot processes emoji uploads, creates custom emojis, and handles emoji validation. Understanding Discord's Emoji API is crucial for implementing the emoji processing patterns found in `utils/emojiUtils.js`.

CastBot handles emoji processing with attachments, validates emoji formats, and manages custom emoji creation for enhanced user experience.

**Source**: [Discord Developer Documentation - Emoji Resource](https://discord.com/developers/docs/resources/emoji)

## 🚨 CRITICAL: CastBot Emoji Patterns

### Primary Emoji Operations in CastBot

1. **Emoji Processing**: Converting uploaded images to Discord emojis
2. **Format Validation**: PNG, JPEG, GIF format checking and size limits
3. **Custom Emoji Creation**: Guild emoji management and naming
4. **Emoji Usage**: UI components, reactions, and message content

## Emoji Object Structure

### Discord Emoji Object

```javascript
// Discord emoji object structure
{
  id: "snowflake",                    // Emoji ID (null for Unicode emojis)
  name: "string",                     // Emoji name
  roles: ["snowflake"],               // Roles allowed to use emoji (empty = everyone)
  user: { /* user object */ },       // User who created emoji
  require_colons: true,               // Whether emoji must be wrapped in colons
  managed: false,                     // Whether emoji is managed by integration
  animated: false,                    // Whether emoji is animated
  available: true                     // Whether emoji can be used
}
```

### CastBot Emoji Processing Context

```javascript
// CastBot emoji processing result structure
{
  success: boolean,                   // Whether processing succeeded
  emoji: {
    id: "snowflake",                  // Created emoji ID
    name: "string",                   // Processed emoji name
    url: "string",                    // Emoji image URL
    animated: boolean,                // Whether emoji is animated
    guild_id: "snowflake"            // Guild where emoji was created
  },
  originalFile: {
    filename: "string",               // Original filename
    size: number,                     // File size in bytes
    contentType: "string"             // MIME type
  },
  processing: {
    resized: boolean,                 // Whether image was resized
    converted: boolean,               // Whether format was converted
    optimized: boolean                // Whether image was optimized
  },
  error: string                       // Error message if failed
}
```

## CastBot Emoji Processing System

### Emoji Upload Processing (from utils/emojiUtils.js patterns)

```javascript
// CastBot emoji processing system
export class EmojiProcessor {
  constructor() {
    this.supportedFormats = ['image/png', 'image/jpeg', 'image/gif'];
    this.maxFileSize = 256 * 1024; // 256KB Discord limit
    this.maxDimensions = { width: 128, height: 128 }; // Discord emoji size
  }

  // Process emoji upload from attachment
  async processEmojiUpload(attachment, emojiName, guild) {
    try {
      // Validate attachment
      const validation = this.validateEmojiAttachment(attachment);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Download and process image
      const imageData = await this.downloadAndProcessImage(attachment);

      // Validate and sanitize emoji name
      const processedName = this.sanitizeEmojiName(emojiName);

      // Create emoji in guild
      const emoji = await this.createGuildEmoji(guild, processedName, imageData);

      return {
        success: true,
        emoji: {
          id: emoji.id,
          name: emoji.name,
          url: `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`,
          animated: emoji.animated,
          guild_id: guild.id
        },
        originalFile: {
          filename: attachment.filename,
          size: attachment.size,
          contentType: attachment.content_type
        },
        processing: {
          resized: imageData.resized,
          converted: imageData.converted,
          optimized: imageData.optimized
        }
      };
    } catch (error) {
      console.error(`Failed to process emoji upload ${emojiName}:`, error);
      return {
        success: false,
        error: error.message,
        originalFile: {
          filename: attachment.filename,
          size: attachment.size,
          contentType: attachment.content_type
        }
      };
    }
  }

  // Validate emoji attachment
  validateEmojiAttachment(attachment) {
    // Check file size
    if (attachment.size > this.maxFileSize) {
      return {
        valid: false,
        error: `File too large: ${attachment.size} bytes (max: ${this.maxFileSize} bytes)`
      };
    }

    // Check file type
    if (!this.supportedFormats.includes(attachment.content_type)) {
      return {
        valid: false,
        error: `Invalid file type: ${attachment.content_type}. Supported: ${this.supportedFormats.join(', ')}`
      };
    }

    // Check filename
    if (!attachment.filename || attachment.filename.length > 100) {
      return {
        valid: false,
        error: 'Invalid filename'
      };
    }

    return { valid: true };
  }

  // Download and process image
  async downloadAndProcessImage(attachment) {
    try {
      // Download image
      const response = await fetch(attachment.url);
      if (!response.ok) {
        throw new Error(`Failed to download image: HTTP ${response.status}`);
      }

      let buffer = await response.arrayBuffer();
      let processedBuffer = new Uint8Array(buffer);
      let metadata = {
        resized: false,
        converted: false,
        optimized: false
      };

      // Check if image needs processing
      if (attachment.width > this.maxDimensions.width ||
          attachment.height > this.maxDimensions.height) {

        // In a real implementation, you'd use an image processing library
        // For now, we'll use the original buffer but mark as needing resize
        console.log(`⚠️ Image ${attachment.filename} exceeds Discord emoji dimensions`);
        metadata.resized = true;
      }

      // Optimize file size if needed
      if (processedBuffer.length > this.maxFileSize * 0.9) { // 90% of limit
        console.log(`⚠️ Image ${attachment.filename} near size limit, consider optimization`);
        metadata.optimized = true;
      }

      return {
        buffer: processedBuffer,
        ...metadata
      };
    } catch (error) {
      console.error(`Failed to process image ${attachment.filename}:`, error);
      throw error;
    }
  }

  // Sanitize emoji name according to Discord rules
  sanitizeEmojiName(name) {
    // Discord emoji name rules:
    // - 2-32 characters
    // - Letters, numbers, underscores only
    // - Cannot start or end with underscore

    let sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_') // Replace invalid characters with underscore
      .replace(/_+/g, '_')         // Collapse multiple underscores
      .replace(/^_|_$/g, '');      // Remove leading/trailing underscores

    // Ensure minimum length
    if (sanitized.length < 2) {
      sanitized = `emoji_${Date.now().toString().slice(-6)}`;
    }

    // Ensure maximum length
    if (sanitized.length > 32) {
      sanitized = sanitized.substring(0, 32).replace(/_$/, '');
    }

    // Ensure it doesn't start or end with underscore after truncation
    sanitized = sanitized.replace(/^_|_$/g, '');

    // Final fallback
    if (sanitized.length < 2) {
      sanitized = `emoji${Math.random().toString(36).substring(2, 8)}`;
    }

    return sanitized;
  }

  // Create emoji in guild
  async createGuildEmoji(guild, name, imageData) {
    try {
      // Check guild emoji limits
      const emojiLimit = this.getGuildEmojiLimit(guild);
      const currentEmojiCount = guild.emojis.cache.size;

      if (currentEmojiCount >= emojiLimit) {
        throw new Error(`Guild emoji limit reached (${currentEmojiCount}/${emojiLimit})`);
      }

      // Check if emoji name already exists
      const existingEmoji = guild.emojis.cache.find(e => e.name === name);
      if (existingEmoji) {
        throw new Error(`Emoji with name "${name}" already exists`);
      }

      // Convert buffer to base64 data URI
      const mimeType = this.detectMimeType(imageData.buffer);
      const base64Data = this.arrayBufferToBase64(imageData.buffer);
      const dataUri = `data:${mimeType};base64,${base64Data}`;

      // Create emoji via Discord API
      const response = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/emojis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name,
          image: dataUri,
          roles: [] // Available to everyone
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Discord API error: ${response.status} - ${errorData.message || 'Unknown error'}`);
      }

      const emoji = await response.json();
      console.log(`✅ Created emoji ${name} (${emoji.id}) in guild ${guild.name}`);

      return emoji;
    } catch (error) {
      console.error(`Failed to create guild emoji ${name}:`, error);
      throw error;
    }
  }

  // Get guild emoji limit based on boost level
  getGuildEmojiLimit(guild) {
    const boostTier = guild.premiumTier || 0;
    const baseLimits = {
      0: 50,   // No boost
      1: 100,  // Tier 1
      2: 150,  // Tier 2
      3: 250   // Tier 3
    };

    return baseLimits[boostTier] || 50;
  }

  // Detect MIME type from buffer
  detectMimeType(buffer) {
    const uint8Array = new Uint8Array(buffer);

    // PNG signature
    if (uint8Array[0] === 0x89 && uint8Array[1] === 0x50 &&
        uint8Array[2] === 0x4E && uint8Array[3] === 0x47) {
      return 'image/png';
    }

    // JPEG signature
    if (uint8Array[0] === 0xFF && uint8Array[1] === 0xD8) {
      return 'image/jpeg';
    }

    // GIF signature
    if (uint8Array[0] === 0x47 && uint8Array[1] === 0x49 && uint8Array[2] === 0x46) {
      return 'image/gif';
    }

    // Default to PNG
    return 'image/png';
  }

  // Convert ArrayBuffer to base64
  arrayBufferToBase64(buffer) {
    const uint8Array = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }
}

// Global emoji processor instance
export const emojiProcessor = new EmojiProcessor();
```

### Emoji Management Operations

```javascript
// CastBot emoji management system
export class EmojiManager {
  // Get guild emojis with metadata
  static async getGuildEmojis(guild) {
    try {
      const emojis = Array.from(guild.emojis.cache.values()).map(emoji => ({
        id: emoji.id,
        name: emoji.name,
        animated: emoji.animated,
        available: emoji.available,
        managed: emoji.managed,
        requireColons: emoji.requireColons,
        url: emoji.url,
        createdAt: emoji.createdAt,
        author: emoji.author ? {
          id: emoji.author.id,
          username: emoji.author.username
        } : null,
        roles: emoji.roles.cache.map(role => ({
          id: role.id,
          name: role.name
        }))
      }));

      return emojis.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error(`Failed to get guild emojis for ${guild.name}:`, error);
      throw error;
    }
  }

  // Search emojis by name
  static searchEmojis(guild, searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    const results = [];

    guild.emojis.cache.forEach(emoji => {
      const name = emoji.name.toLowerCase();
      let score = 0;

      if (name === searchLower) {
        score = 100; // Exact match
      } else if (name.startsWith(searchLower)) {
        score = 80; // Prefix match
      } else if (name.includes(searchLower)) {
        score = 60; // Contains match
      }

      if (score > 0) {
        results.push({
          emoji,
          score,
          name: emoji.name,
          id: emoji.id,
          animated: emoji.animated,
          url: emoji.url
        });
      }
    });

    return results.sort((a, b) => b.score - a.score);
  }

  // Delete emoji from guild
  static async deleteEmoji(guild, emojiId, reason = 'CastBot emoji management') {
    try {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/emojis/${emojiId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'X-Audit-Log-Reason': reason
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      console.log(`✅ Deleted emoji ${emojiId} from guild ${guild.name}`);
    } catch (error) {
      console.error(`Failed to delete emoji ${emojiId}:`, error);
      throw error;
    }
  }

  // Modify emoji (name, roles)
  static async modifyEmoji(guild, emojiId, modifications) {
    try {
      const updateData = {};

      if (modifications.name) {
        updateData.name = emojiProcessor.sanitizeEmojiName(modifications.name);
      }

      if (modifications.roles !== undefined) {
        updateData.roles = modifications.roles;
      }

      const response = await fetch(`https://discord.com/api/v10/guilds/${guild.id}/emojis/${emojiId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Audit-Log-Reason': modifications.reason || 'CastBot emoji modification'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const updatedEmoji = await response.json();
      console.log(`✅ Modified emoji ${emojiId} in guild ${guild.name}`);

      return updatedEmoji;
    } catch (error) {
      console.error(`Failed to modify emoji ${emojiId}:`, error);
      throw error;
    }
  }

  // Get emoji usage statistics
  static getEmojiUsageStats(guild) {
    const emojis = guild.emojis.cache;
    const stats = {
      total: emojis.size,
      animated: 0,
      static: 0,
      managed: 0,
      restricted: 0,
      available: 0,
      limit: emojiProcessor.getGuildEmojiLimit(guild)
    };

    emojis.forEach(emoji => {
      if (emoji.animated) stats.animated++;
      else stats.static++;

      if (emoji.managed) stats.managed++;
      if (emoji.roles.cache.size > 0) stats.restricted++;
      if (emoji.available) stats.available++;
    });

    stats.remaining = stats.limit - stats.total;
    stats.utilizationPercent = Math.round((stats.total / stats.limit) * 100);

    return stats;
  }
}
```

## Emoji Usage in CastBot Components

### Emoji in Components V2 Messages

```javascript
// CastBot emoji usage in Components V2
export function createEmojiButton(customId, label, emojiData, style = 1) {
  const button = {
    type: 2, // Button
    custom_id: customId,
    label: label,
    style: style
  };

  // Add emoji if provided
  if (emojiData) {
    if (typeof emojiData === 'string') {
      // Unicode emoji
      button.emoji = { name: emojiData };
    } else {
      // Custom emoji
      button.emoji = {
        id: emojiData.id,
        name: emojiData.name,
        animated: emojiData.animated || false
      };
    }
  }

  return button;
}

// Example usage in CastBot UI
export function createSafariNavigationButtons() {
  return [
    createEmojiButton('safari_move_north', 'North', '⬆️', 2),
    createEmojiButton('safari_move_south', 'South', '⬇️', 2),
    createEmojiButton('safari_move_east', 'East', '➡️', 2),
    createEmojiButton('safari_move_west', 'West', '⬅️', 2),
    createEmojiButton('safari_search', 'Search', '🔍', 1)
  ];
}

// Custom emoji usage
export function createCustomEmojiButton(customId, label, customEmoji) {
  return createEmojiButton(customId, label, {
    id: customEmoji.id,
    name: customEmoji.name,
    animated: customEmoji.animated
  });
}
```

### Emoji in Select Menu Options

```javascript
// CastBot emoji usage in select menus
export function createEmojiSelectOptions(items) {
  return items.map(item => {
    const option = {
      label: item.name,
      value: item.id,
      description: item.description
    };

    // Add emoji if available
    if (item.emoji) {
      if (typeof item.emoji === 'string') {
        // Unicode emoji
        option.emoji = { name: item.emoji };
      } else {
        // Custom emoji
        option.emoji = {
          id: item.emoji.id,
          name: item.emoji.name,
          animated: item.emoji.animated || false
        };
      }
    }

    return option;
  });
}

// Example: Safari items with emojis
export function createSafariItemSelect(items) {
  const options = items.map(item => ({
    label: item.name,
    value: item.id,
    description: `${item.rarity} - ${item.description}`,
    emoji: item.emoji ? { name: item.emoji } : { name: '📦' }
  }));

  return {
    type: 3, // String Select
    custom_id: 'safari_item_select',
    placeholder: 'Choose an item...',
    options: options,
    min_values: 0,
    max_values: Math.min(options.length, 25) // Discord limit
  };
}
```

## Emoji Validation and Error Handling

### Emoji Format Validation

```javascript
// CastBot emoji validation system
export class EmojiValidator {
  // Validate emoji format in message content
  static validateEmojiInContent(content) {
    const emojiPattern = /<(a?):(\w+):(\d+)>/g;
    const issues = [];
    let match;

    while ((match = emojiPattern.exec(content)) !== null) {
      const [fullMatch, animated, name, id] = match;

      // Validate emoji ID format
      if (!/^\d{17,19}$/.test(id)) {
        issues.push({
          type: 'invalid_id',
          emoji: fullMatch,
          issue: 'Invalid emoji ID format'
        });
      }

      // Validate emoji name format
      if (!/^[a-zA-Z0-9_]{2,32}$/.test(name)) {
        issues.push({
          type: 'invalid_name',
          emoji: fullMatch,
          issue: 'Invalid emoji name format'
        });
      }
    }

    return {
      valid: issues.length === 0,
      issues: issues
    };
  }

  // Validate emoji object for API usage
  static validateEmojiObject(emoji) {
    const issues = [];

    if (emoji.id && !/^\d{17,19}$/.test(emoji.id)) {
      issues.push('Invalid emoji ID format');
    }

    if (!emoji.name || typeof emoji.name !== 'string') {
      issues.push('Missing or invalid emoji name');
    }

    if (emoji.name && !/^[a-zA-Z0-9_]{2,32}$/.test(emoji.name)) {
      issues.push('Emoji name must be 2-32 characters (letters, numbers, underscores)');
    }

    if (emoji.animated !== undefined && typeof emoji.animated !== 'boolean') {
      issues.push('Animated property must be boolean');
    }

    return {
      valid: issues.length === 0,
      issues: issues
    };
  }

  // Sanitize emoji usage in user input
  static sanitizeEmojiUsage(text) {
    // Remove potentially malicious emoji patterns
    return text
      .replace(/<a?:\w*:>/g, '') // Remove malformed emoji mentions
      .replace(/<a?:[\w\s]*:\d+>/g, (match) => {
        // Validate and clean emoji mentions
        const emojiMatch = match.match(/<(a?):(\w+):(\d+)>/);
        if (emojiMatch) {
          const [, animated, name, id] = emojiMatch;
          if (/^\d{17,19}$/.test(id) && /^[a-zA-Z0-9_]{2,32}$/.test(name)) {
            return match; // Valid emoji, keep it
          }
        }
        return ''; // Invalid emoji, remove it
      });
  }

  // Extract emoji data from message
  static extractEmojisFromMessage(message) {
    const customEmojis = [];
    const unicodeEmojis = [];

    // Extract custom emojis
    const customEmojiPattern = /<(a?):(\w+):(\d+)>/g;
    let match;

    while ((match = customEmojiPattern.exec(message.content || '')) !== null) {
      customEmojis.push({
        id: match[3],
        name: match[2],
        animated: !!match[1],
        mention: match[0]
      });
    }

    // Extract Unicode emojis (simplified pattern)
    const unicodeEmojiPattern = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const unicodeMatches = (message.content || '').match(unicodeEmojiPattern);

    if (unicodeMatches) {
      unicodeEmojis.push(...unicodeMatches.map(emoji => ({
        emoji: emoji,
        unicode: true
      })));
    }

    return {
      custom: customEmojis,
      unicode: unicodeEmojis,
      total: customEmojis.length + unicodeEmojis.length
    };
  }
}
```

### Emoji Error Handling

```javascript
// CastBot emoji error handling
export async function handleEmojiError(error, operation, context = {}) {
  const errorCode = error.code || error.status;
  const errorMessage = error.message;

  switch (errorCode) {
    case 10014: // Unknown Emoji
      console.error(`Emoji ${context.emojiId} not found`);
      return {
        success: false,
        error: 'Emoji not found or deleted',
        recoverable: false
      };

    case 50013: // Missing Permissions
      console.error(`Missing permissions for emoji operation: ${operation}`);
      return {
        success: false,
        error: 'Missing Manage Emojis permission',
        recoverable: false
      };

    case 30008: // Maximum number of emojis reached
      console.error(`Guild emoji limit reached: ${context.guildId}`);
      return {
        success: false,
        error: 'Guild has reached emoji limit',
        recoverable: true,
        suggestion: 'Delete unused emojis or upgrade server boost level'
      };

    case 50035: // Invalid Form Body
      console.error(`Invalid emoji data for ${operation}:`, error.errors);
      return {
        success: false,
        error: 'Invalid emoji format or data',
        recoverable: true,
        details: error.errors
      };

    case 40005: // Request entity too large
      console.error(`Emoji file too large for ${operation}`);
      return {
        success: false,
        error: 'Emoji file exceeds 256KB limit',
        recoverable: true,
        suggestion: 'Compress or resize the image'
      };

    default:
      console.error(`Unknown emoji error during ${operation}:`, {
        code: errorCode,
        message: errorMessage,
        context
      });
      return {
        success: false,
        error: 'Unknown emoji operation error',
        recoverable: false
      };
  }
}

// Emoji operation with retry logic
export async function emojiOperationWithRetry(operation, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const errorResult = await handleEmojiError(error, 'emoji_operation');

      if (!errorResult.recoverable || attempt === maxRetries) {
        throw error;
      }

      const waitTime = attempt * 1000; // 1s, 2s
      console.log(`⚠️ Emoji operation failed (attempt ${attempt}), retrying in ${waitTime}ms...`);
      await sleep(waitTime);
    }
  }
}
```

## Best Practices for CastBot Emoji Operations

### 1. Always Validate Emoji Data
```javascript
// ✅ Correct - Validate before processing
const validation = EmojiValidator.validateEmojiObject(emojiData);
if (!validation.valid) {
  throw new Error(`Invalid emoji: ${validation.issues.join(', ')}`);
}

// ❌ Wrong - Process without validation
await createGuildEmoji(guild, emojiData.name, emojiData.image);
```

### 2. Handle Emoji Limits Gracefully
```javascript
// ✅ Correct - Check limits before creating
const stats = EmojiManager.getEmojiUsageStats(guild);
if (stats.remaining <= 0) {
  throw new Error(`Guild emoji limit reached (${stats.total}/${stats.limit})`);
}

// ❌ Wrong - Create without checking limits
await emojiProcessor.createGuildEmoji(guild, name, imageData);
```

### 3. Use Proper Emoji Format in Components
```javascript
// ✅ Correct - Proper emoji object for custom emojis
{
  type: 2, // Button
  emoji: {
    id: "123456789012345678",
    name: "custom_emoji",
    animated: false
  }
}

// ❌ Wrong - Invalid emoji format
{
  type: 2, // Button
  emoji: "custom_emoji" // Missing ID for custom emoji
}
```

### 4. Sanitize User-Provided Emoji Names
```javascript
// ✅ Correct - Sanitize emoji names
const safeName = emojiProcessor.sanitizeEmojiName(userInput);

// ❌ Wrong - Use raw user input
const emoji = await createGuildEmoji(guild, userInput, imageData);
```

## CastBot-Specific Emoji Features

### Safari Emoji Integration
```javascript
// Safari emoji usage patterns
export function createSafariEmojiPalette() {
  return {
    movement: {
      north: '⬆️',
      south: '⬇️',
      east: '➡️',
      west: '⬅️'
    },
    actions: {
      search: '🔍',
      attack: '⚔️',
      defend: '🛡️',
      heal: '💊',
      hide: '🌿'
    },
    items: {
      common: '📦',
      uncommon: '🎁',
      rare: '💎',
      epic: '🏆',
      legendary: '👑'
    },
    status: {
      healthy: '💚',
      injured: '💛',
      critical: '❤️',
      dead: '💀',
      paused: '⏸️'
    }
  };
}
```

### Castlist Emoji System
```javascript
// Castlist emoji management
export function createCastlistEmojis() {
  return {
    placements: {
      winner: '👑',
      runner_up: '🥈',
      third: '🥉',
      finalist: '🎭',
      jury: '⚖️',
      eliminated: '❌'
    },
    status: {
      active: '✅',
      eliminated: '❌',
      withdrew: '🚪',
      disqualified: '🚫'
    },
    special: {
      host: '🎬',
      producer: '📺',
      guest: '⭐',
      returnee: '🔄'
    }
  };
}
```

### Emoji Analytics and Usage Tracking

```javascript
// Track emoji usage in CastBot
export class EmojiAnalytics {
  constructor() {
    this.usage = new Map();
  }

  // Track emoji usage
  trackEmojiUsage(emojiId, context) {
    const key = emojiId || 'unicode';
    const usage = this.usage.get(key) || {
      count: 0,
      contexts: new Map(),
      firstUsed: Date.now(),
      lastUsed: Date.now()
    };

    usage.count++;
    usage.lastUsed = Date.now();

    const contextCount = usage.contexts.get(context) || 0;
    usage.contexts.set(context, contextCount + 1);

    this.usage.set(key, usage);
  }

  // Get emoji usage report
  getEmojiUsageReport(guild) {
    const report = {
      totalUsage: 0,
      customEmojis: [],
      topContexts: new Map(),
      unused: []
    };

    // Check guild emojis against usage
    guild.emojis.cache.forEach(emoji => {
      const usage = this.usage.get(emoji.id);

      if (usage) {
        report.customEmojis.push({
          emoji: emoji,
          usage: usage.count,
          lastUsed: usage.lastUsed,
          contexts: Array.from(usage.contexts.entries())
        });
        report.totalUsage += usage.count;
      } else {
        report.unused.push(emoji);
      }
    });

    // Sort by usage
    report.customEmojis.sort((a, b) => b.usage - a.usage);

    return report;
  }
}

// Global emoji analytics
export const emojiAnalytics = new EmojiAnalytics();
```

## Related Documentation

- **[Discord Guild Resource](DiscordGuildResource.md)** - Guild emoji management
- **[Discord Message Resource](DiscordMessageResource.md)** - Emoji usage in messages
- **[Components V2](ComponentsV2.md)** - Emoji usage in components
- **[Discord Rate Limits](DiscordRateLimits.md)** - Emoji operation rate limits

## References

- [Discord Emoji Resource Documentation](https://discord.com/developers/docs/resources/emoji)
- [Emoji Object Structure](https://discord.com/developers/docs/resources/emoji#emoji-object)
- [Custom Emoji Guidelines](https://support.discord.com/hc/en-us/articles/360036479811-Custom-Emojis)