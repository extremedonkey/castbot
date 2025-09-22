# Discord Webhook Resource API

## Overview

Webhooks are **critical to CastBot's interaction system** - every follow-up message, deferred response, and interaction callback uses webhook endpoints. Understanding webhook patterns is essential for proper interaction handling and response management.

CastBot heavily relies on interaction tokens (which are webhook tokens) for follow-up messages, editing responses, and managing complex interactions.

**Source**: [Discord Developer Documentation - Webhook Resource](https://discord.com/developers/docs/resources/webhook)

## 🚨 CRITICAL: CastBot Webhook Patterns

### Primary Webhook Usage in CastBot

1. **Interaction Follow-ups**: Secondary responses after initial interaction
2. **Deferred Response Editing**: Converting "thinking..." to actual response
3. **Original Response Management**: Editing/deleting initial interaction responses
4. **External Integrations**: Server analytics, monitoring notifications

### Webhook vs Regular Channel Messages

| Operation | Webhook Endpoint | Regular Channel | CastBot Usage |
|-----------|------------------|-----------------|---------------|
| **Initial interaction response** | `POST /interactions/{id}/{token}/callback` | N/A | ✅ Primary pattern |
| **Follow-up messages** | `POST /webhooks/{app_id}/{token}` | `POST /channels/{id}/messages` | ✅ Webhook preferred |
| **Edit original response** | `PATCH /webhooks/{app_id}/{token}/messages/@original` | `PATCH /channels/{id}/messages/{id}` | ✅ Webhook only option |
| **Rate limiting** | Webhook-specific limits | Global + per-channel | ✅ Better for interactions |

## Interaction Webhook Patterns

### CastBot Interaction Token Management

```javascript
// CastBot interaction token handling
export class InteractionWebhookManager {
  constructor() {
    this.tokenCache = new Map();
    this.rateLimiters = new Map();
  }

  // Store interaction token for later use
  cacheInteractionToken(interactionId, token, expiresAt = Date.now() + 15 * 60 * 1000) {
    this.tokenCache.set(interactionId, {
      token,
      expiresAt,
      createdAt: Date.now()
    });

    // Clean up expired tokens
    setTimeout(() => {
      this.tokenCache.delete(interactionId);
    }, expiresAt - Date.now());
  }

  // Get cached token
  getInteractionToken(interactionId) {
    const cached = this.tokenCache.get(interactionId);
    if (!cached || Date.now() > cached.expiresAt) {
      return null;
    }
    return cached.token;
  }

  // Check if token is still valid
  isTokenValid(interactionId) {
    const cached = this.tokenCache.get(interactionId);
    return cached && Date.now() < cached.expiresAt;
  }
}

// Global instance for CastBot
export const webhookManager = new InteractionWebhookManager();
```

### Follow-up Message Pattern (Heavy CastBot Usage)

```javascript
// CastBot follow-up message pattern
export async function sendFollowupMessage(interactionToken, content, options = {}) {
  try {
    const messageData = {
      ...content,
      flags: options.ephemeral ? InteractionResponseFlags.EPHEMERAL : undefined
    };

    // Remove undefined properties
    Object.keys(messageData).forEach(key => {
      if (messageData[key] === undefined) {
        delete messageData[key];
      }
    });

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
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const message = await response.json();
    console.log(`✅ Sent follow-up message via webhook`);

    return message;
  } catch (error) {
    console.error('Failed to send follow-up message:', error);
    throw error;
  }
}

// CastBot follow-up with Components V2
export async function sendCastBotFollowup(interactionToken, content, options = {}) {
  const messageData = createCastBotMessage(content, {
    components: options.components,
    accentColor: options.accentColor
  });

  // Add ephemeral flag if requested
  if (options.ephemeral) {
    messageData.flags = (messageData.flags || 0) | InteractionResponseFlags.EPHEMERAL;
  }

  return await sendFollowupMessage(interactionToken, messageData, options);
}
```

### Original Response Management

```javascript
// CastBot original response editing (used extensively)
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

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const message = await response.json();
    console.log(`✅ Edited original interaction response`);

    return message;
  } catch (error) {
    console.error('Failed to edit original response:', error);
    throw error;
  }
}

// Delete original response
export async function deleteOriginalResponse(interactionToken) {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${interactionToken}/messages/@original`,
      {
        method: 'DELETE'
      }
    );

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    console.log(`✅ Deleted original interaction response`);
  } catch (error) {
    console.error('Failed to delete original response:', error);
    throw error;
  }
}

// Get original response (for checking existence)
export async function getOriginalResponse(interactionToken) {
  try {
    const response = await fetch(
      `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${interactionToken}/messages/@original`,
      {
        method: 'GET'
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null; // No original response exists
      }
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to get original response:', error);
    throw error;
  }
}
```

### Deferred Response Pattern

```javascript
// CastBot deferred response handling
export async function handleDeferredResponse(req, res, handler) {
  try {
    // Send immediate deferred response
    await res.send({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });

    const { token } = req.body;

    try {
      // Execute actual handler
      const result = await handler(req.body);

      // Convert result to webhook message format
      const webhookMessage = {
        ...result,
        flags: undefined // Remove flags for webhook messages
      };

      // Edit the deferred response with actual content
      await editOriginalResponse(token, webhookMessage);

      console.log(`✅ Completed deferred response`);
    } catch (handlerError) {
      // Send error response via webhook
      const errorMessage = createCastBotMessage(
        "❌ An error occurred while processing your request.",
        { accentColor: 0xe74c3c }
      );

      await editOriginalResponse(token, errorMessage);

      console.error('Deferred response handler error:', handlerError);
    }
  } catch (error) {
    console.error('Failed to handle deferred response:', error);
    // Original response already failed, can't recover
  }
}

// Helper for long operations
export async function withDeferredResponse(interaction, handler) {
  const { id, token } = interaction;

  try {
    // Cache the token for later use
    webhookManager.cacheInteractionToken(id, token);

    // Execute handler with ability to edit response
    const result = await handler({
      ...interaction,
      editResponse: (content) => editOriginalResponse(token, content),
      followUp: (content, options) => sendFollowupMessage(token, content, options),
      deleteResponse: () => deleteOriginalResponse(token)
    });

    return result;
  } catch (error) {
    console.error('Error in deferred response handler:', error);
    throw error;
  }
}
```

## Webhook Rate Limiting Patterns

### CastBot Webhook Rate Limiting

```javascript
// Webhook-specific rate limiting (different from regular API)
export class WebhookRateLimiter {
  constructor() {
    this.buckets = new Map();
  }

  // Webhook rate limits: 5 requests per 5 seconds per webhook
  async respectWebhookRateLimit(webhookToken) {
    const now = Date.now();
    const bucket = this.buckets.get(webhookToken) || {
      requests: [],
      limit: 5,
      window: 5000
    };

    // Remove requests outside the time window
    bucket.requests = bucket.requests.filter(time => now - time < bucket.window);

    // Check if at limit
    if (bucket.requests.length >= bucket.limit) {
      const oldestRequest = bucket.requests[0];
      const waitTime = bucket.window - (now - oldestRequest);

      console.log(`⏳ Webhook rate limit: waiting ${waitTime}ms`);
      await sleep(waitTime);

      // Recursive check after waiting
      return this.respectWebhookRateLimit(webhookToken);
    }

    // Record this request
    bucket.requests.push(now);
    this.buckets.set(webhookToken, bucket);
  }

  // Batch webhook operations with rate limiting
  async batchWebhookOperations(webhookToken, operations) {
    const results = [];

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];

      // Respect rate limit before each operation
      await this.respectWebhookRateLimit(webhookToken);

      try {
        const result = await operation();
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }

      // Add delay between operations if not the last one
      if (i < operations.length - 1) {
        await sleep(1200); // 1.2 seconds between operations
      }
    }

    return results;
  }
}

// Global rate limiter instance
export const webhookRateLimiter = new WebhookRateLimiter();
```

### Queue-Based Webhook Management

```javascript
// CastBot webhook queue system
export class WebhookQueue {
  constructor() {
    this.queues = new Map(); // Per-token queues
    this.processing = new Set();
  }

  async queueWebhookOperation(token, operation, priority = 0) {
    if (!this.queues.has(token)) {
      this.queues.set(token, []);
    }

    const queue = this.queues.get(token);

    // Add operation to queue with priority
    queue.push({
      operation,
      priority,
      timestamp: Date.now(),
      id: Math.random().toString(36).substr(2, 9)
    });

    // Sort by priority (higher numbers first)
    queue.sort((a, b) => b.priority - a.priority);

    // Process queue if not already processing
    if (!this.processing.has(token)) {
      this.processQueue(token);
    }
  }

  async processQueue(token) {
    if (this.processing.has(token)) {
      return; // Already processing this token's queue
    }

    this.processing.add(token);
    const queue = this.queues.get(token) || [];

    try {
      while (queue.length > 0) {
        const item = queue.shift();

        try {
          // Respect rate limits
          await webhookRateLimiter.respectWebhookRateLimit(token);

          // Execute operation
          await item.operation();

          console.log(`✅ Processed webhook operation ${item.id}`);
        } catch (error) {
          console.error(`❌ Webhook operation ${item.id} failed:`, error);

          // Retry logic for certain errors
          if (error.status === 429) {
            // Re-queue with lower priority
            queue.unshift({ ...item, priority: item.priority - 1 });
          }
        }
      }
    } finally {
      this.processing.delete(token);

      // Clean up empty queue
      if (queue.length === 0) {
        this.queues.delete(token);
      }
    }
  }
}

// Global webhook queue
export const webhookQueue = new WebhookQueue();
```

## File Upload via Webhooks

### CastBot Webhook File Upload

```javascript
// File upload through webhook (Safari maps, attachments)
export async function uploadFileViaWebhook(webhookToken, fileBuffer, filename, content = null) {
  try {
    const formData = new FormData();

    // Add file
    const blob = new Blob([fileBuffer]);
    formData.append('files[0]', blob, filename);

    // Add message content if provided
    if (content) {
      formData.append('payload_json', JSON.stringify(content));
    }

    const response = await fetch(
      `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${webhookToken}`,
      {
        method: 'POST',
        body: formData
        // Note: Don't set Content-Type header for FormData
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const message = await response.json();
    console.log(`✅ Uploaded file ${filename} via webhook`);

    return {
      message,
      attachmentUrl: message.attachments[0]?.url
    };
  } catch (error) {
    console.error(`Failed to upload file ${filename} via webhook:`, error);
    throw error;
  }
}

// Upload with CastBot message format
export async function uploadCastBotFile(webhookToken, fileBuffer, filename, messageContent) {
  const content = createCastBotMessage(messageContent, {
    components: [{
      type: 13, // File component
      file: { url: `attachment://${filename}` }
    }]
  });

  return await uploadFileViaWebhook(webhookToken, fileBuffer, filename, content);
}
```

## External Webhook Integration

### CastBot External Webhooks (Analytics, Monitoring)

```javascript
// CastBot external webhook system for analytics and monitoring
export class ExternalWebhookManager {
  constructor() {
    this.webhooks = new Map();
    this.rateLimiters = new Map();
  }

  // Register external webhook
  registerWebhook(name, url, options = {}) {
    this.webhooks.set(name, {
      url,
      username: options.username || 'CastBot',
      avatar_url: options.avatarUrl || null,
      defaultColor: options.defaultColor || 0x5865f2,
      rateLimit: options.rateLimit || { requests: 30, window: 60000 } // 30 per minute
    });

    console.log(`✅ Registered external webhook: ${name}`);
  }

  // Send message to external webhook
  async sendToWebhook(webhookName, content) {
    const webhook = this.webhooks.get(webhookName);
    if (!webhook) {
      throw new Error(`Webhook ${webhookName} not registered`);
    }

    // Rate limit check
    await this.respectExternalRateLimit(webhookName);

    try {
      const payload = {
        username: webhook.username,
        avatar_url: webhook.avatar_url,
        ...content
      };

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      console.log(`✅ Sent message to external webhook: ${webhookName}`);
    } catch (error) {
      console.error(`Failed to send to webhook ${webhookName}:`, error);
      throw error;
    }
  }

  // Send analytics data
  async sendAnalytics(data) {
    const embed = {
      title: "📊 CastBot Analytics",
      description: `Server: **${data.guildName}**`,
      color: 0x2ecc71,
      fields: [
        {
          name: "Activity",
          value: `${data.commandsToday} commands today\n${data.activeUsers} active users`,
          inline: true
        },
        {
          name: "Performance",
          value: `${data.avgResponseTime}ms avg response\n${data.errorRate}% error rate`,
          inline: true
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: "CastBot Analytics",
        icon_url: "https://cdn.discordapp.com/avatars/bot_id/avatar.png"
      }
    };

    await this.sendToWebhook('analytics', { embeds: [embed] });
  }

  // Send error alerts
  async sendErrorAlert(error, context = {}) {
    const embed = {
      title: "🚨 CastBot Error Alert",
      description: "An error occurred in production",
      color: 0xe74c3c,
      fields: [
        {
          name: "Error",
          value: `\`\`\`\n${error.message}\n\`\`\``,
          inline: false
        },
        {
          name: "Context",
          value: [
            context.guildId ? `Guild: ${context.guildId}` : null,
            context.channelId ? `Channel: ${context.channelId}` : null,
            context.userId ? `User: ${context.userId}` : null,
            context.command ? `Command: ${context.command}` : null
          ].filter(Boolean).join('\n') || 'No context available',
          inline: false
        }
      ],
      timestamp: new Date().toISOString()
    };

    await this.sendToWebhook('alerts', { embeds: [embed] });
  }

  async respectExternalRateLimit(webhookName) {
    const webhook = this.webhooks.get(webhookName);
    const rateLimit = webhook.rateLimit;
    const now = Date.now();

    const limiter = this.rateLimiters.get(webhookName) || {
      requests: [],
      limit: rateLimit.requests,
      window: rateLimit.window
    };

    // Remove old requests
    limiter.requests = limiter.requests.filter(time => now - time < limiter.window);

    // Check limit
    if (limiter.requests.length >= limiter.limit) {
      const oldestRequest = limiter.requests[0];
      const waitTime = limiter.window - (now - oldestRequest);

      console.log(`⏳ External webhook rate limit: waiting ${waitTime}ms for ${webhookName}`);
      await sleep(waitTime);
      return this.respectExternalRateLimit(webhookName);
    }

    // Record request
    limiter.requests.push(now);
    this.rateLimiters.set(webhookName, limiter);
  }
}

// Global external webhook manager
export const externalWebhooks = new ExternalWebhookManager();
```

## Webhook Security and Validation

### CastBot Webhook Security

```javascript
// Webhook security and validation
export class WebhookSecurity {
  // Validate webhook signature (for incoming webhooks)
  static verifyWebhookSignature(payload, signature, secret) {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const providedSignature = signature.replace('sha256=', '');

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );
  }

  // Sanitize webhook content
  static sanitizeWebhookContent(content) {
    // Remove potential security issues
    const sanitized = { ...content };

    // Remove @everyone and @here mentions
    if (sanitized.content) {
      sanitized.content = sanitized.content
        .replace(/@everyone/g, '@\u200beveryone')
        .replace(/@here/g, '@\u200bhere');
    }

    // Sanitize embed content
    if (sanitized.embeds) {
      sanitized.embeds = sanitized.embeds.map(embed => ({
        ...embed,
        title: embed.title?.substring(0, 256), // Discord limit
        description: embed.description?.substring(0, 4096), // Discord limit
        fields: embed.fields?.slice(0, 25).map(field => ({ // Max 25 fields
          name: field.name?.substring(0, 256),
          value: field.value?.substring(0, 1024),
          inline: !!field.inline
        }))
      }));
    }

    return sanitized;
  }

  // Rate limit webhook by IP/user
  static createWebhookRateLimiter() {
    const attempts = new Map();

    return (identifier, limit = 10, window = 60000) => {
      const now = Date.now();
      const userAttempts = attempts.get(identifier) || [];

      // Remove old attempts
      const recentAttempts = userAttempts.filter(time => now - time < window);

      if (recentAttempts.length >= limit) {
        throw new Error('Rate limit exceeded for webhook');
      }

      recentAttempts.push(now);
      attempts.set(identifier, recentAttempts);

      return true;
    };
  }
}
```

## Webhook Error Handling

### CastBot Webhook Error Patterns

```javascript
// Comprehensive webhook error handling
export async function handleWebhookError(error, operation, context = {}) {
  const errorCode = error.status || error.code;
  const errorMessage = error.message;

  switch (errorCode) {
    case 10015: // Unknown Webhook
      console.error(`Webhook not found or deleted: ${context.webhookId || 'unknown'}`);
      // Remove webhook from cache/database
      await handleWebhookDeletion(context.webhookId);
      break;

    case 50027: // Invalid Webhook Token
      console.error(`Invalid webhook token for operation: ${operation}`);
      // Token may have expired or been regenerated
      await handleInvalidWebhookToken(context.webhookToken);
      break;

    case 10008: // Unknown Message
      console.error(`Message not found for webhook operation: ${operation}`);
      // Original message may have been deleted
      return null; // Don't throw for missing messages

    case 50035: // Invalid Form Body
      console.error(`Invalid webhook payload for ${operation}:`, error.errors);
      // Log the specific validation errors
      break;

    case 40005: // Request Entity Too Large
      console.error(`Webhook payload too large for ${operation}`);
      // Try to reduce payload size
      await handleOversizedWebhookPayload(context);
      break;

    case 50006: // Cannot Send Empty Message
      console.error(`Attempted to send empty webhook message`);
      // Ensure message has content or embeds
      break;

    case 429: // Rate Limited
      console.error(`Webhook rate limited for ${operation}`);
      // Implement exponential backoff
      const retryAfter = error.retry_after || 1;
      await sleep(retryAfter * 1000);
      throw new Error(`Rate limited: retry after ${retryAfter}s`);

    default:
      console.error(`Unknown webhook error during ${operation}:`, {
        code: errorCode,
        message: errorMessage,
        context
      });
  }

  throw error; // Re-throw for upstream handling
}

// Webhook operation with retry logic
export async function webhookOperationWithRetry(operation, maxRetries = 3, backoffMs = 1000) {
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

      const waitTime = backoffMs * Math.pow(2, attempt - 1); // Exponential backoff
      console.log(`⚠️ Webhook operation failed (attempt ${attempt}), retrying in ${waitTime}ms...`);
      await sleep(waitTime);
    }
  }
}
```

## Best Practices for CastBot Webhook Operations

### 1. Always Use Interaction Tokens for Follow-ups
```javascript
// ✅ Correct - Use interaction token for follow-up
await sendFollowupMessage(interaction.token, content);

// ❌ Wrong - Use regular channel endpoint
await sendToChannel(interaction.channel_id, content);
```

### 2. Handle Token Expiration Gracefully
```javascript
// ✅ Correct - Check token validity
if (webhookManager.isTokenValid(interactionId)) {
  await editOriginalResponse(token, content);
} else {
  console.log('Interaction token expired, skipping update');
}

// ❌ Wrong - Assume token is always valid
await editOriginalResponse(token, content);
```

### 3. Use Queuing for Multiple Operations
```javascript
// ✅ Correct - Queue webhook operations
await webhookQueue.queueWebhookOperation(token, () =>
  sendFollowupMessage(token, content1)
);
await webhookQueue.queueWebhookOperation(token, () =>
  sendFollowupMessage(token, content2)
);

// ❌ Wrong - Concurrent webhook calls
await Promise.all([
  sendFollowupMessage(token, content1),
  sendFollowupMessage(token, content2)
]);
```

### 4. Sanitize External Webhook Content
```javascript
// ✅ Correct - Sanitize before sending
const sanitized = WebhookSecurity.sanitizeWebhookContent(content);
await externalWebhooks.sendToWebhook('alerts', sanitized);

// ❌ Wrong - Send unsanitized content
await externalWebhooks.sendToWebhook('alerts', content);
```

## CastBot-Specific Webhook Patterns

### Safari Update Webhooks
```javascript
// Safari-specific webhook patterns
export async function sendSafariUpdateWebhook(interactionToken, safariData) {
  const content = createCastBotMessage(
    `## 🦁 Safari Round ${safariData.round} Complete!`,
    {
      accentColor: 0xf39c12,
      components: [{
        type: 1, // Action Row
        components: [{
          type: 2, // Button
          custom_id: `safari_results_${safariData.round}`,
          label: "View Results",
          style: 1,
          emoji: { name: "📊" }
        }]
      }]
    }
  );

  return await sendFollowupMessage(interactionToken, content);
}
```

### Production Alert Webhooks
```javascript
// Production monitoring webhook
export async function sendProductionAlert(alertType, data) {
  const colors = {
    error: 0xe74c3c,
    warning: 0xf39c12,
    info: 0x3498db,
    success: 0x2ecc71
  };

  const embed = {
    title: `🚨 Production Alert: ${alertType.toUpperCase()}`,
    color: colors[alertType] || colors.info,
    fields: Object.entries(data).map(([key, value]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value: String(value),
      inline: true
    })),
    timestamp: new Date().toISOString()
  };

  await externalWebhooks.sendToWebhook('monitoring', { embeds: [embed] });
}
```

## Related Documentation

- **[Discord Interaction API](DiscordInteractionAPI.md)** - Interaction token management
- **[Discord Rate Limits](DiscordRateLimits.md)** - Webhook-specific rate limiting
- **[Discord Channel Resource](DiscordChannelResource.md)** - Channel vs webhook messaging
- **[Discord Message Resource](DiscordMessageResource.md)** - Message structure for webhooks

## References

- [Discord Webhook Resource Documentation](https://discord.com/developers/docs/resources/webhook)
- [Webhook Rate Limits](https://discord.com/developers/docs/topics/rate-limits#webhook-rate-limits)
- [Interaction Responses](https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-response)