# Discord Rate Limits Reference

## Overview

Discord enforces rate limits to prevent API abuse and ensure service stability. Understanding rate limits is **critical for production stability** - improper handling causes "429 Too Many Requests" errors and bot downtime.

CastBot implements **custom rate limiting patterns** in deployment scripts and batching in several managers. This document standardizes rate limit handling across the entire codebase.

**Source**: [Discord Developer Documentation - Rate Limits](https://discord.com/developers/docs/topics/rate-limits)

## 🚨 CRITICAL: Rate Limit Fundamentals

### Rate Limit Types

1. **Global Rate Limit**: 50 requests per second across ALL endpoints
2. **Per-Route Rate Limits**: Specific limits per endpoint type
3. **Per-Resource Rate Limits**: Limits per guild/channel/user
4. **Interaction Rate Limits**: Special handling for interactions

### Rate Limit Headers

```javascript
// Discord returns these headers with every response
{
  'x-ratelimit-limit': '5',           // Max requests allowed
  'x-ratelimit-remaining': '3',       // Requests remaining
  'x-ratelimit-reset': '1640995200',  // Unix timestamp when limit resets
  'x-ratelimit-reset-after': '1.5',   // Seconds until reset
  'x-ratelimit-bucket': 'hash',       // Bucket identifier
  'x-ratelimit-scope': 'user'         // Scope (user, guild, global)
}
```

## CastBot Rate Limiting Patterns

### Pattern 1: Deployment Script Rate Limiting

From `scripts/deployment/manage-commands.js`:

```javascript
// CastBot's production-tested rate limiting
async function rateLimitAwareRequest(endpoint, options, retries = 3) {
  try {
    const response = await DiscordRequest(endpoint, options);
    return response;
  } catch (error) {
    // Handle rate limiting with exponential backoff
    if (error?.message?.includes('rate limited') && retries > 0) {
      const waitTime = Math.pow(2, 4 - retries) * 1000; // 2s, 4s, 8s
      console.log(`⚠️ Rate limited, waiting ${waitTime}ms before retry...`);
      await sleep(waitTime);
      return rateLimitAwareRequest(endpoint, options, retries - 1);
    }
    throw error;
  }
}

// Usage in command deployment
const response = await rateLimitAwareRequest(endpoint, { method: 'GET' });
```

### Pattern 2: Batching for Rate Limit Compliance

From `anchorMessageManager.js`:

```javascript
// Batch operations to respect rate limits
async function updateAnchorMessages() {
  const batchSize = 5; // Process 5 at a time to avoid rate limits

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);

    // Process batch
    await Promise.all(batch.map(update => processUpdate(update)));

    // Wait between batches if not the last one
    if (i + batchSize < updates.length) {
      await sleep(1000); // 1 second between batches
    }
  }
}
```

### Pattern 3: Interaction Rate Limit Handling

```javascript
// Interactions have special rate limit considerations
// These endpoints are NOT bound to global rate limit:
// - POST /interactions/{id}/{token}/callback
// - POST /webhooks/{app_id}/{token}
// - PATCH /webhooks/{app_id}/{token}/messages/@original

// However, they share webhook rate limits with follow-ups
const followUpLimiter = new Map(); // Track per-interaction rate limits

async function sendFollowUp(interactionToken, message) {
  const key = `followup_${interactionToken}`;
  const lastRequest = followUpLimiter.get(key) || 0;
  const timeSince = Date.now() - lastRequest;

  // Webhook rate limit: 5 requests per 5 seconds
  if (timeSince < 1000) { // Less than 1 second since last request
    await sleep(1000 - timeSince);
  }

  followUpLimiter.set(key, Date.now());
  return await fetch(`/webhooks/${APP_ID}/${interactionToken}`, {
    method: 'POST',
    body: JSON.stringify(message)
  });
}
```

## Discord Rate Limit Buckets

### Common Rate Limits by Endpoint Type

| Endpoint Category | Rate Limit | Bucket Type | CastBot Usage |
|------------------|------------|-------------|---------------|
| **Interactions** | No global limit | Per-interaction | Primary CastBot pattern |
| **Webhooks** | 5/5 seconds | Per-webhook | Follow-up messages |
| **Messages** | 5/5 seconds | Per-channel | Message editing |
| **Guild Management** | 5/5 seconds | Per-guild | Role/channel creation |
| **Command Registration** | 200/day | Global | Deployment scripts |
| **File Uploads** | 10/10 seconds | Per-channel | Safari maps, emojis |

### Bucket Identification

```javascript
// Rate limit buckets are identified by:
// 1. HTTP Method + Route
// 2. Major parameters (guild_id, channel_id, webhook_id)

// Examples:
// GET /guilds/{guild_id} - Per guild bucket
// POST /channels/{channel_id}/messages - Per channel bucket
// POST /webhooks/{webhook_id}/{token} - Per webhook bucket
```

## Rate Limit Response Handling

### 429 Response Structure

```javascript
// When rate limited, Discord returns:
{
  "message": "You are being rate limited.",
  "retry_after": 64.57,        // Seconds to wait
  "global": false,             // Whether this is a global rate limit
  "code": 0                    // Error code
}
```

### CastBot Rate Limit Handler

```javascript
// Universal rate limit handler for CastBot
export async function handleRateLimit(response, originalRequest, maxRetries = 3) {
  if (response.status !== 429) {
    return response;
  }

  const rateLimitData = await response.json();
  const retryAfter = Math.ceil(rateLimitData.retry_after * 1000); // Convert to ms
  const isGlobal = rateLimitData.global;

  console.log(`⚠️ Rate limited: ${isGlobal ? 'Global' : 'Route'} limit hit, waiting ${retryAfter}ms`);

  if (maxRetries <= 0) {
    throw new Error(`Rate limit exceeded: ${rateLimitData.message}`);
  }

  // Wait for rate limit to reset
  await sleep(retryAfter);

  // Retry original request
  return await makeRequest(originalRequest, maxRetries - 1);
}
```

## Production Rate Limit Strategies

### Strategy 1: Proactive Rate Limiting (Recommended)

```javascript
// Track and respect rate limits proactively
class RateLimiter {
  constructor() {
    this.buckets = new Map();
    this.globalReset = 0;
    this.globalRemaining = 50;
  }

  async waitForRateLimit(route, major) {
    const bucket = this.getBucket(route, major);
    const now = Date.now();

    // Check global rate limit
    if (this.globalRemaining <= 1 && now < this.globalReset) {
      const waitTime = this.globalReset - now;
      console.log(`⏳ Waiting ${waitTime}ms for global rate limit reset`);
      await sleep(waitTime);
    }

    // Check bucket rate limit
    if (bucket.remaining <= 1 && now < bucket.reset) {
      const waitTime = bucket.reset - now;
      console.log(`⏳ Waiting ${waitTime}ms for bucket rate limit reset`);
      await sleep(waitTime);
    }
  }

  updateFromHeaders(headers, route, major) {
    // Update global limits
    this.globalRemaining = parseInt(headers['x-ratelimit-global-remaining']) || 50;
    this.globalReset = parseInt(headers['x-ratelimit-global-reset']) || 0;

    // Update bucket limits
    const bucket = this.getBucket(route, major);
    bucket.remaining = parseInt(headers['x-ratelimit-remaining']) || 1;
    bucket.reset = Date.now() + (parseFloat(headers['x-ratelimit-reset-after']) * 1000);
  }
}
```

### Strategy 2: Exponential Backoff (CastBot Current)

```javascript
// Current CastBot implementation with improvements
async function makeRequestWithBackoff(url, options, attempt = 1, maxAttempts = 4) {
  try {
    const response = await fetch(url, options);

    if (response.status === 429) {
      if (attempt >= maxAttempts) {
        throw new Error('Max rate limit retries exceeded');
      }

      const retryAfter = response.headers.get('retry-after');
      const waitTime = retryAfter ?
        parseFloat(retryAfter) * 1000 :
        Math.pow(2, attempt) * 1000; // 2s, 4s, 8s, 16s

      console.log(`⚠️ Rate limited (attempt ${attempt}), waiting ${waitTime}ms`);
      await sleep(waitTime);

      return makeRequestWithBackoff(url, options, attempt + 1, maxAttempts);
    }

    return response;
  } catch (error) {
    if (attempt >= maxAttempts) throw error;

    const waitTime = Math.pow(2, attempt) * 1000;
    console.log(`🔄 Request failed (attempt ${attempt}), retrying in ${waitTime}ms`);
    await sleep(waitTime);

    return makeRequestWithBackoff(url, options, attempt + 1, maxAttempts);
  }
}
```

## Specific Rate Limit Scenarios

### Command Registration (Deployment)

```javascript
// Command registration has strict daily limits
const COMMAND_DEPLOYMENT_LIMITS = {
  globalCommands: 200,      // Per day
  guildCommands: 200,       // Per guild per day
  bulkOverwrite: 2          // Per 10 minutes
};

// CastBot deployment strategy
async function deployCommands(commands) {
  console.log(`📊 Deploying ${commands.length} commands...`);

  // Use bulk overwrite (more efficient, less rate limit impact)
  try {
    const response = await rateLimitAwareRequest(`applications/${APP_ID}/commands`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(commands)
    });

    console.log('✅ Commands deployed successfully');
    return response;
  } catch (error) {
    console.error('❌ Command deployment failed:', error);
    throw error;
  }
}
```

### File Upload Rate Limits

```javascript
// File uploads (Safari maps, emojis) have special considerations
async function uploadFile(channelId, file, filename) {
  const formData = new FormData();
  formData.append('file', file, filename);

  // File uploads: 10 requests per 10 seconds per channel
  const bucketKey = `upload_${channelId}`;
  await respectUploadRateLimit(bucketKey);

  return await makeRequestWithBackoff(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: formData
  });
}

const uploadLimiters = new Map();

async function respectUploadRateLimit(bucketKey) {
  const bucket = uploadLimiters.get(bucketKey) || { requests: [], limit: 10, window: 10000 };
  const now = Date.now();

  // Remove requests outside the time window
  bucket.requests = bucket.requests.filter(time => now - time < bucket.window);

  // If at limit, wait
  if (bucket.requests.length >= bucket.limit) {
    const oldestRequest = bucket.requests[0];
    const waitTime = bucket.window - (now - oldestRequest);
    console.log(`⏳ Upload rate limit: waiting ${waitTime}ms`);
    await sleep(waitTime);

    // Recurse to check again
    return await respectUploadRateLimit(bucketKey);
  }

  // Record this request
  bucket.requests.push(now);
  uploadLimiters.set(bucketKey, bucket);
}
```

## CastBot Integration Patterns

### Pattern 1: Analytics Rate Limiting

```javascript
// From src/analytics/analyticsLogger.js
class AnalyticsLogger {
  constructor() {
    this.rateLimiter = new Map();
    this.batchQueue = [];
    this.batchTimer = null;
  }

  async logEvent(event) {
    // Add to batch queue instead of immediate send
    this.batchQueue.push(event);

    // Process batch after delay (reduces API calls)
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.processBatch();
        this.batchTimer = null;
      }, 5000); // 5 second batching
    }
  }

  async processBatch() {
    if (this.batchQueue.length === 0) return;

    const events = this.batchQueue.splice(0, 10); // Max 10 per batch

    try {
      await this.sendBatchToDiscord(events);
    } catch (error) {
      if (error.status === 429) {
        // Re-queue events on rate limit
        this.batchQueue.unshift(...events);

        // Schedule retry
        setTimeout(() => this.processBatch(), 30000); // 30 second retry
      }
    }
  }
}
```

### Pattern 2: Message Update Rate Limiting

```javascript
// For anchor message updates and similar
class MessageUpdateManager {
  constructor() {
    this.updateQueue = new Map(); // Group by channel
    this.processing = new Set();
  }

  async queueUpdate(channelId, messageId, update) {
    const key = `${channelId}_${messageId}`;

    // Debounce rapid updates to same message
    if (this.updateQueue.has(key)) {
      clearTimeout(this.updateQueue.get(key).timer);
    }

    this.updateQueue.set(key, {
      channelId,
      messageId,
      update,
      timer: setTimeout(() => this.processUpdate(key), 2000) // 2 second debounce
    });
  }

  async processUpdate(key) {
    if (this.processing.has(key)) return;

    this.processing.add(key);
    const updateData = this.updateQueue.get(key);

    try {
      await this.sendUpdate(updateData);
    } catch (error) {
      if (error.status === 429) {
        // Reschedule with backoff
        setTimeout(() => {
          this.processing.delete(key);
          this.processUpdate(key);
        }, 60000); // 1 minute backoff
        return;
      }
    }

    this.updateQueue.delete(key);
    this.processing.delete(key);
  }
}
```

## Rate Limit Monitoring and Debugging

### Monitoring Rate Limit Health

```javascript
// Add to production monitoring
class RateLimitMonitor {
  constructor() {
    this.bucketStats = new Map();
    this.rateLimitHits = [];
  }

  recordRateLimit(bucket, endpoint, retryAfter) {
    this.rateLimitHits.push({
      timestamp: Date.now(),
      bucket,
      endpoint,
      retryAfter
    });

    // Alert if too many rate limits
    const recentHits = this.rateLimitHits.filter(
      hit => Date.now() - hit.timestamp < 300000 // 5 minutes
    );

    if (recentHits.length > 10) {
      console.error('🚨 Rate limit warning: Too many rate limits hit recently');
      // Could send to monitoring service
    }
  }

  getBucketHealth(bucket) {
    const stats = this.bucketStats.get(bucket) || {
      requests: 0,
      rateLimits: 0,
      lastRateLimit: null
    };

    return {
      ...stats,
      healthScore: stats.requests > 0 ?
        (1 - stats.rateLimits / stats.requests) : 1
    };
  }
}
```

### Debug Rate Limit Information

```javascript
// Add debugging information to requests
async function debugRequest(url, options) {
  const start = Date.now();

  try {
    const response = await fetch(url, options);
    const duration = Date.now() - start;

    console.log('📊 Request debug:', {
      url: url.replace(/\/\d+/g, '/{id}'), // Anonymize IDs
      status: response.status,
      duration: `${duration}ms`,
      remaining: response.headers.get('x-ratelimit-remaining'),
      reset: response.headers.get('x-ratelimit-reset-after'),
      bucket: response.headers.get('x-ratelimit-bucket')
    });

    return response;
  } catch (error) {
    console.error('📊 Request failed:', {
      url: url.replace(/\/\d+/g, '/{id}'),
      duration: `${Date.now() - start}ms`,
      error: error.message
    });
    throw error;
  }
}
```

## Best Practices for CastBot

### 1. Always Use Exponential Backoff
```javascript
// ✅ Correct - Built-in backoff
await rateLimitAwareRequest(endpoint, options);

// ❌ Wrong - No retry mechanism
await fetch(endpoint, options);
```

### 2. Batch Similar Operations
```javascript
// ✅ Correct - Batch message updates
const updates = messages.map(msg => ({ id: msg.id, content: newContent }));
await batchUpdateMessages(channelId, updates);

// ❌ Wrong - Individual requests
for (const message of messages) {
  await updateMessage(message.id, newContent); // Rate limit risk
}
```

### 3. Use Interaction Endpoints When Possible
```javascript
// ✅ Correct - Not bound to global rate limit
await fetch(`/interactions/${id}/${token}/callback`, options);

// ❌ Less efficient - Bound to global rate limit
await fetch(`/channels/${channelId}/messages`, options);
```

### 4. Monitor Rate Limit Headers
```javascript
// ✅ Correct - Track and respect headers
const response = await fetch(url, options);
updateRateLimitState(response.headers);

// ❌ Wrong - Ignore rate limit information
const response = await fetch(url, options);
return response.json();
```

## Common Rate Limit Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `429 Too Many Requests` | Exceeded bucket limit | Implement exponential backoff |
| `Global rate limit exceeded` | >50 requests/second | Add global rate limiting |
| `Command registration failed` | Daily limit exceeded | Use bulk overwrite instead |
| `File upload timeout` | Upload rate limit | Implement upload queue |

## Emergency Rate Limit Recovery

```javascript
// If production hits severe rate limiting
class EmergencyRateLimit {
  static async enableSlowMode() {
    console.log('🚨 Emergency rate limit mode enabled');

    // Increase all delays by 5x
    global.RATE_LIMIT_MULTIPLIER = 5;

    // Pause non-essential operations
    global.PAUSE_ANALYTICS = true;
    global.PAUSE_BATCH_UPDATES = true;

    // Only allow critical operations
    global.CRITICAL_ONLY_MODE = true;
  }

  static async recoverFromRateLimit() {
    console.log('🔄 Attempting rate limit recovery...');

    // Wait 5 minutes
    await sleep(300000);

    // Gradually restore normal operation
    global.RATE_LIMIT_MULTIPLIER = 2;

    setTimeout(() => {
      global.RATE_LIMIT_MULTIPLIER = 1;
      global.PAUSE_ANALYTICS = false;
      global.PAUSE_BATCH_UPDATES = false;
      global.CRITICAL_ONLY_MODE = false;
      console.log('✅ Rate limit recovery complete');
    }, 600000); // 10 more minutes
  }
}
```

## Related Documentation

- **[Discord Interaction API](DiscordInteractionAPI.md)** - Interaction-specific rate limits
- **[Discord Webhook Resource](DiscordWebhookResource.md)** - Webhook rate limit patterns
- **[Production Monitoring](../infrastructure/ProductionMonitoring.md)** - Rate limit monitoring

## References

- [Discord Rate Limits Documentation](https://discord.com/developers/docs/topics/rate-limits)
- [HTTP Status Codes](https://discord.com/developers/docs/topics/opcodes-and-status-codes#http)
- [Best Practices for Rate Limiting](https://discord.com/developers/docs/topics/rate-limits#rate-limits)