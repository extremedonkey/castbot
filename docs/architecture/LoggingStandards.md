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

## Future Claude Instructions

When working on CastBot logging:
1. **READ THIS FILE FIRST** before modifying any logs
2. **USE logger utility** for all new logging
3. **FOLLOW migration pattern** for existing logs
4. **TEST thoroughly** in development before production
5. **UPDATE this document** if adding new patterns

For production troubleshooting:
1. Use existing SSH infrastructure
2. Enable FORCE_DEBUG if needed
3. Use pm2 logs with grep filtering
4. Disable debug mode when done