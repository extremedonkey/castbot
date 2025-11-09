# CastBot Logging Standards

## Overview

CastBot uses environment-aware logging to provide detailed debugging in development while maintaining performance in production.

## Logging Utilities

### Core Logger (`logger.js`)
```javascript
const isDev = process.env.NODE_ENV !== 'production';
const forceDebug = process.env.FORCE_DEBUG === 'true';
const DEBUG = isDev || forceDebug;

export const logger = {
    debug: (feature, message, data = null) => {
        if (DEBUG) {
            const timestamp = new Date().toISOString();
            const logMsg = `🔍 [${timestamp}] [${feature}] ${message}`;
            if (data) {
                console.log(logMsg, data);
            } else {
                console.log(logMsg);
            }
        }
    },
    
    info: (feature, message, data = null) => {
        const timestamp = new Date().toISOString();
        const logMsg = `ℹ️ [${timestamp}] [${feature}] ${message}`;
        if (data) {
            console.log(logMsg, data);
        } else {
            console.log(logMsg);
        }
    },
    
    warn: (feature, message, data = null) => {
        const timestamp = new Date().toISOString();
        const logMsg = `⚠️ [${timestamp}] [${feature}] ${message}`;
        if (data) {
            console.warn(logMsg, data);
        } else {
            console.warn(logMsg);
        }
    },
    
    error: (feature, message, error = null) => {
        const timestamp = new Date().toISOString();
        const logMsg = `❌ [${timestamp}] [${feature}] ${message}`;
        if (error) {
            console.error(logMsg, error);
        } else {
            console.error(logMsg);
        }
    },
    
    perf: (feature, operation, duration) => {
        if (DEBUG) {
            console.log(`⏱️ [PERF] [${feature}] ${operation} took ${duration}ms`);
        }
    }
};
```

## Usage Patterns

### Standard Logging
```javascript
import { logger } from './logger.js';

// Debug (dev only)
logger.debug('SAFARI', 'Processing attack button click', { userId, itemId });

// Info (always logged)
logger.info('MENU', 'User opened production menu', { userId, guildId });

// Warning (always logged)
logger.warn('STORAGE', 'Player data migration needed', { guildId });

// Error (always logged)
logger.error('BUTTON', 'Failed to process interaction', error);

// Performance (dev only)
const start = Date.now();
// ... operation ...
logger.perf('DATABASE', 'Player data save', Date.now() - start);
```

### Feature Categories
Use these standard feature names for consistency:
- `SAFARI` - Safari system interactions
- `MENU` - Menu navigation and management
- `BUTTON` - Button handler processing
- `STORAGE` - Data persistence operations
- `DISCORD` - Discord API interactions
- `AUTH` - Permission and authentication
- `DEPLOY` - Deployment and configuration
- `PERF` - Performance measurements

## Discord Logging Layer

CastBot has a second logging layer that posts interaction logs to Discord channels for real-time monitoring.

### Analytics Logger (`/src/analytics/analyticsLogger.js`)

**Location:** `/home/reece/castbot/src/analytics/analyticsLogger.js`

**Purpose:** Logs all user interactions to:
1. Local file: `./logs/user-analytics.log`
2. Discord channel: `#logs-dev` (development) or configured channel (production)
3. Safari-specific channel: Guild-specific channel for Safari actions

**Key Functions:**

#### `logInteraction()`
Records user interactions and routes to appropriate Discord channels:
```javascript
import { logInteraction } from './src/analytics/analyticsLogger.js';

// Log a button click
await logInteraction(
  userId,          // Discord user ID
  guildId,         // Discord guild ID
  'BUTTON_CLICK',  // Action type
  custom_id,       // Button custom ID
  username,        // Discord username
  guildName,       // Guild name
  components,      // Message components (for button label extraction)
  channelName,     // Channel name (optional)
  displayName,     // User's server display name (optional)
  safariContent    // Safari-specific data (optional)
);
```

#### `postToDiscordLogs()`
Internal function that posts formatted logs to Discord channels with:
- **Rate limiting**: 1.2 seconds between messages
- **Queue processing**: Queues messages when rate limited (max 50)
- **User exclusion**: Environment-specific user filtering
- **Channel routing**: Sends to #logs-dev or production analytics channel

#### `postToSafariLog()`
Posts Safari-specific actions to guild-configured log channels:
- Whispers, item pickups, currency changes, purchases
- Store transactions, button actions, map movement
- Attacks, custom actions, test messages

**Action Types:**
```javascript
'SLASH_COMMAND'        // Slash command execution (/menu, /castlist)
'BUTTON_CLICK'         // Button interaction (extracts human-readable label)
'SAFARI_WHISPER'       // Safari whisper messages
'SAFARI_ITEM_PICKUP'   // Item collection
'SAFARI_CURRENCY'      // Currency changes
'SAFARI_PURCHASE'      // Store purchases
'SAFARI_BUTTON'        // Safari action buttons
'SAFARI_MOVEMENT'      // Map movement
'SAFARI_ATTACK'        // Attack scheduling
'SAFARI_CUSTOM_ACTION' // Custom action execution
'SAFARI_TEST'          // Safari log test messages
```

**Log Format:**
```
[8:33AM] Thu 19 Jun 25 | ReeceBot (extremedonkey) in CastBot (1331657596087566398) | #deploy | BUTTON_CLICK | 📋 Menu (viral_menu)
```

**Button Label Extraction:**
The system automatically extracts human-readable button labels with emojis:
```javascript
// Instead of: "Processing custom_id: viral_menu"
// Logs as:    "📋 Menu (viral_menu)"
```

### Configuration

**Environment Config** (`environmentConfig.json`):
```json
{
  "liveDiscordLogging": {
    "enabled": true,
    "targetGuildId": "1331657596087566398",
    "targetChannelId": "1402172748405383209",
    "excludedUserIds": {
      "development": [],
      "production": ["391415444084490240"]
    }
  }
}
```

**Safari Log Settings** (per guild in `safariContent.json`):
```json
{
  "safariLogSettings": {
    "enabled": true,
    "logChannelId": "1234567890",
    "logTypes": {
      "whispers": true,
      "itemPickups": true,
      "currencyChanges": true,
      "storeTransactions": true,
      "buttonActions": true,
      "mapMovement": false,
      "attacks": true,
      "customActions": true,
      "testMessages": true
    }
  }
}
```

### Usage Examples

```javascript
// Set Discord client (done once in app.js)
import { setDiscordClient } from './src/analytics/analyticsLogger.js';
setDiscordClient(client);

// Log a slash command
await logInteraction(
  userId,
  guildId,
  'SLASH_COMMAND',
  '/menu',
  username,
  guildName
);

// Log a button with components for label extraction
await logInteraction(
  userId,
  guildId,
  'BUTTON_CLICK',
  'viral_menu',
  username,
  guildName,
  req.body.message.components,  // Extract button label
  channelName,
  displayName
);

// Log Safari action (routes to Safari Log channel)
await logInteraction(
  userId,
  guildId,
  'SAFARI_ITEM_PICKUP',
  itemId,
  username,
  guildName,
  null,
  channelName,
  displayName,
  {
    location: 'A5',
    itemName: 'Ruby',
    itemEmoji: '💎',
    quantity: 1,
    channelName: 'game-channel'
  }
);
```

## PM2 Error Monitoring

CastBot includes automated PM2 error monitoring that posts errors to Discord.

### PM2 Error Logger (`/src/monitoring/pm2ErrorLogger.js`)

**Location:** `/home/reece/castbot/src/monitoring/pm2ErrorLogger.js`

**Purpose:** Monitors PM2 logs and auto-posts errors to Discord #error channel every 60 seconds.

**Features:**
- **Dual-mode operation**: Local file reading (dev/prod server) or SSH remote monitoring (monitoring prod from dev)
- **Bulletproof design**: Never crashes the bot, all errors isolated
- **Log rotation detection**: Automatically handles PM2 log rotation
- **Smart filtering**: Only posts ERROR, FATAL, CRITICAL, failed, TypeError patterns
- **Position tracking**: Persists log positions to avoid duplicate posts

**Architecture:**
```javascript
// Singleton pattern - only one instance runs
import { getPM2ErrorLogger } from './src/monitoring/pm2ErrorLogger.js';

const pm2Logger = getPM2ErrorLogger(client);
pm2Logger.start();  // Starts 60-second interval monitoring
```

**Log Paths:**
```javascript
// Development (local files)
'./logs/pm2-out.log'
'./logs/pm2-error.log'

// Production (on server)
'/home/bitnami/.pm2/logs/castbot-pm-out.log'
'/home/bitnami/.pm2/logs/castbot-pm-error.log'

// Production (remote monitoring via SSH)
// Automatically connects to 13.238.148.170 via SSH key
```

**Discord Output Format:**
```
🔴 **[PM2-PROD]** 2:34PM
```
=== ERRORS ===
TypeError: Cannot read property 'id' of undefined
    at processButton (app.js:1234)
...
```
```

**Error Filtering Patterns:**
- ERROR, FATAL, CRITICAL keywords
- ❌ emoji
- "failed" or "Failed" keywords
- JavaScript errors: TypeError, ReferenceError, SyntaxError

**Position Tracking:**
Saves log read positions to `./logs/pm2-positions.json`:
```json
{
  "dev": { "out": 12345, "error": 6789 },
  "prod": { "out": 98765, "error": 43210 }
}
```

### Environment Detection

**Automatic environment detection:**
```javascript
// Detects if running ON prod server vs monitoring remotely
isRunningOnProdServer() {
  const username = os.userInfo().username;
  const prodLogDirExists = fs.existsSync('/home/bitnami/.pm2/logs');
  return username === 'bitnami' && prodLogDirExists;
}
```

**Behavior:**
- **Dev environment** → Reads local `./logs/pm2-*.log` files
- **Prod environment ON server** → Reads local `/home/bitnami/.pm2/logs/` files
- **Prod environment OFF server** → SSH to `bitnami@13.238.148.170` to read remote logs

### Environment Configuration

**Development:**
```bash
NODE_ENV=development  # Enables all debug logs
```

**Production:**
```bash
NODE_ENV=production   # Only info, warn, error logs
FORCE_DEBUG=true      # Emergency debug mode for production troubleshooting
```

## Migration Guidelines

### When Adding Logging to New Features
1. Always use the logger utility, never direct console.log
2. Choose appropriate log level (debug for detailed tracing, info for important events)
3. Include relevant context data
4. Use consistent feature categories

### When Modifying Existing Logs
1. **DO NOT** change existing console.log statements immediately
2. **ADD** new logger calls alongside existing ones
3. **TEST** thoroughly before removing old logs
4. **MIGRATE** one feature at a time

### Example Migration Pattern
```javascript
// OLD (keep during transition)
console.log('🔍 DEBUG: Processing button click for user:', userId);

// NEW (add alongside)
logger.debug('BUTTON', 'Processing button click', { userId, buttonId });

// After testing, remove old log
```

## Production Troubleshooting

### Emergency Debug Mode
```bash
# SSH to production
export FORCE_DEBUG=true
pm2 restart castbot-pm
pm2 logs castbot-pm

# Disable when done
unset FORCE_DEBUG
pm2 restart castbot-pm
```

### Log Filtering
```bash
# View specific feature logs
pm2 logs castbot-pm | grep '\[SAFARI\]'

# View only errors
pm2 logs castbot-pm | grep '❌'

# View performance logs
pm2 logs castbot-pm | grep '\[PERF\]'
```

## Definition of Done Requirements

Every new feature MUST include:
- [ ] Appropriate debug logging for development troubleshooting
- [ ] Info logging for important user actions
- [ ] Error logging with proper context
- [ ] Performance logging for operations > 100ms
- [ ] Use of logger utility (not direct console.log)
- [ ] Consistent feature category naming

## Common Patterns

### Button Handler Logging
```javascript
logger.debug('BUTTON', `Processing ${custom_id}`, { userId, guildId });
// ... handler logic ...
logger.info('BUTTON', `Completed ${custom_id}`, { userId, result });
```

### Error Handling
```javascript
try {
    // ... operation ...
    logger.info('SAFARI', 'Currency updated successfully', { userId, newBalance });
} catch (error) {
    logger.error('SAFARI', 'Failed to update currency', error);
    // ... error response ...
}
```

### Performance Monitoring
```javascript
const start = Date.now();
const result = await heavyOperation();
logger.perf('STORAGE', 'Player data load', Date.now() - start);
```

## Logging Architecture Summary

CastBot has **three logging layers** that work together:

| Layer | Component | Output | Purpose |
|-------|-----------|--------|---------|
| **1. Local Logging** | `logger.js` | Console/stdout | Development debugging, local troubleshooting |
| **2. Discord Logging** | `analyticsLogger.js` | Discord channels | Real-time user interaction monitoring |
| **3. PM2 Error Monitoring** | `pm2ErrorLogger.js` | Discord #error | Automatic error detection and alerting |

**When to use each layer:**

- **Local logging** (`logger.js`):
  - Feature development and debugging
  - Performance measurements
  - Internal state tracking
  - Production troubleshooting (FORCE_DEBUG mode)

- **Discord logging** (`logInteraction()`):
  - User actions (slash commands, button clicks)
  - Safari gameplay events
  - Analytics and usage tracking
  - Server installation notifications

- **PM2 error monitoring** (automatic):
  - No manual intervention needed
  - Runs in background, posts to #error every 60s
  - Works in dev and prod environments

## Future Claude Instructions

When working on CastBot logging:
1. **READ THIS FILE FIRST** before modifying any logs
2. **USE logger utility** for all new local logging (`logger.js`)
3. **USE logInteraction()** for all user interactions (`analyticsLogger.js`)
4. **NEVER modify PM2ErrorLogger** - it's bulletproof by design
5. **FOLLOW migration pattern** for existing logs
6. **TEST thoroughly** in development before production
7. **UPDATE this document** if adding new patterns

For production troubleshooting:
1. Check Discord #logs-dev or production analytics channel for interaction logs
2. Check Discord #error channel for PM2 errors
3. Use existing SSH infrastructure for manual log inspection
4. Enable FORCE_DEBUG if needed for detailed local logs
5. Use pm2 logs with grep filtering for specific errors
6. Disable debug mode when done

For adding new logging to features:
1. Add `logger.debug()` calls for development tracing
2. Call `logInteraction()` for user-facing actions
3. Pass `safariContent` object for Safari actions (auto-routes to Safari Log)
4. Extract button labels by passing `req.body.message.components` to logInteraction()