# PM2 Error Logger

**Location**: `/src/monitoring/pm2ErrorLogger.js`
**Discord Channel**: `#error` (ID: 1416025517706186845)
**Check Interval**: 60 seconds
**Status**: Active in both dev and production

## Overview

The PM2 Error Logger is an automated monitoring system that continuously watches PM2 process logs and posts critical errors to a dedicated Discord channel. It operates as a bulletproof singleton that **never crashes the main bot** - all errors are caught and isolated.

## Architecture

### Dual-Mode Operation

The logger supports two modes of operation:

1. **Local File Reading** (Dev & On-Prod-Server)
   - Reads PM2 logs directly from the filesystem
   - Used when running in development
   - Used when running ON the production server itself

2. **Remote SSH Reading** (Remote Prod Monitoring)
   - Connects via SSH to read production logs
   - Used when monitoring production from a development machine
   - Requires SSH key: `~/.ssh/castbot-key.pem`
   - Target: `bitnami@13.238.148.170`

### Log Paths

```javascript
const PM2_LOG_PATHS = {
  dev: {
    out: './logs/pm2-out.log',
    error: './logs/pm2-error.log',
    processName: 'castbot-pm-dev',
    local: true
  },
  prod: {
    out: '/home/bitnami/.pm2/logs/castbot-pm-out.log',
    error: '/home/bitnami/.pm2/logs/castbot-pm-error.log',
    processName: 'castbot-pm',
    local: false
  }
};
```

## Error Detection Patterns

The logger identifies critical issues using pattern matching on log content:

### Error Log (`pm2-error.log`)
- All non-benign content is posted, **bucketed by severity** (see Severity Tiers below)
- Last 50 lines maximum per bucket per check

### Output Log (`pm2-out.log`)
Lines matching ANY of these patterns are flagged:

```javascript
// Severity keywords
line.includes('ERROR')
line.includes('FATAL')
line.includes('CRITICAL')

// Failure text
line.includes('failed')
line.includes('Failed')

// JavaScript errors
line.includes('Error:')
line.includes('TypeError')
line.includes('ReferenceError')
line.includes('SyntaxError')
```

Last 30 critical lines maximum per check. Zero-count success summaries (`failed 0`, `0 failed`) are stripped before matching (`stripZeroCountTokens`).

## Severity Tiers & Battle-Stations Ping (2026-08-04)

The `#error` channel is set to **@mentions-only** notifications in Discord. The logger decides per batch whether to ping Reece, keyed off the level markers `logger.js` emits — **not** off predicting what errors look like:

| Line shape (stderr) | Bucket | Card |
|---|---|---|
| Starts `⚠️ ` / `ℹ️ ` / `🔍 ` / `⏱️ ` (deliberate `logger.warn`/`info`/`debug`/`perf`) | **warn** — posted, never pings | 🟡 `PM2 Warnings · ENV`, gray accent |
| Starts `❌ ` (`logger.error`) | **severe** | Red/env card, `<@Reece>` ping |
| Anything else — raw stack traces, unhandled rejections, unknown formats | **severe** (fail-loud default) | Red/env card, `<@Reece>` ping |

Key mechanics (`classifyStderr` in pm2ErrorLogger.js, exported for tests):
- **Continuation grouping**: `console.warn(msg, obj)` prints the object dump across multiple lines (indented fields, closing `}` at column 0). Those lines follow their record's bucket, so a warn's dump doesn't ping. Orphan continuations at a batch boundary stay quiet (their opener was classified last tick).
- **PM2 timestamp prefixes** (`2026-07-08T03:53:52: ⚠️ ...`) are stripped before marker matching (`stripPm2Timestamp`).
- **stdout keyword hits** starting with a quiet marker (e.g. `ℹ️ ... failed 3 times`) go to the warn bucket (`isQuietStdoutLine`).
- **Ping rule**: `severe.length > 0 && env !== 'dev'` — dev errors happen at the keyboard mid-development; prod/test run unattended. The mention is a `<@userId>` line in the card header plus `allowed_mentions` on the POST (same pattern as ProdWatchdog).
- Mixed batches render `=== ERRORS ===` above `=== WARNINGS ===` and ping.

**Failure direction**: unknown formats default to *pinging*. Maintenance lives only on the quiet side (the closed set of markers logger.js deliberately emits) — a novel crash format can never slip through silently.

## Features

### 1. Log Rotation Detection

The logger automatically detects when PM2 rotates logs:

```javascript
// If file size < last position, log was rotated
if (errorContent.length < positions.error) {
  console.log('[PM2Logger] 🔄 Log rotation detected - resetting position');
  positions.error = 0;
}
```

### 2. Position Tracking

Maintains persistent position tracking to avoid re-posting the same errors:

- **Storage**: `./logs/pm2-positions.json`
- **Structure**:
  ```json
  {
    "dev": { "out": 12345, "error": 6789 },
    "prod": { "out": 23456, "error": 7890 }
  }
  ```

### 3. Bulletproof Error Handling

Every operation is wrapped in try-catch blocks to prevent crashes:

```javascript
try {
  await this.checkLogs();
} catch (error) {
  // This catch ensures the interval continues even if check fails
  console.error('[PM2Logger] Interval error (isolated):', error.message);
}
```

**Guarantee**: The PM2 Error Logger will **never** crash the main bot.

### 4. Discord Message Formatting

Posts are Components V2 cards (`buildErrorLogContainer`) with per-env identity:

```
🔴 PM2 Errors · PROD        (red accent, pings <@Reece>)
🟦 PM2 Errors · TEST        (blue accent, pings <@Reece>)
🟡 PM2 Errors · DEV         (yellow accent, no ping)
🟡 PM2 Warnings · <ENV>     (gray accent, warn-only batch, never pings)

=== ERRORS ===
[severe lines]

=== WARNINGS ===
[warn-grade lines]
```

### 5. Message Truncation

Discord caps total Text Display content at 4000 chars per message — the log body is capped at `LOG_CONTENT_CAP` (3500) with a `... [truncated]` marker, leaving headroom for the header and mention line.

## Usage

### Initialization

The logger is initialized as a singleton when the Discord client is ready:

```javascript
import { getPM2ErrorLogger } from './src/monitoring/pm2ErrorLogger.js';

// After client.login()
client.once('ready', () => {
  const pm2Logger = getPM2ErrorLogger(client);
  pm2Logger.start();
});
```

### Manual Control

```javascript
const pm2Logger = getPM2ErrorLogger(client);

// Start monitoring
pm2Logger.start();

// Stop monitoring
pm2Logger.stop();

// Manual check (normally called by interval)
await pm2Logger.checkLogs();
```

## Environment Detection

The logger automatically detects its environment:

```javascript
const env = process.env.PRODUCTION === 'TRUE' ? 'prod' : 'dev';
const isOnProdServer = this.isRunningOnProdServer();  // Checks username & log dir
const shouldReadLocal = env === 'dev' || isOnProdServer;
```

**Detection Logic**:
1. If `PRODUCTION !== 'TRUE'` → Dev mode, read local files
2. If `PRODUCTION === 'TRUE'` AND running as `bitnami` user → Read local files
3. If `PRODUCTION === 'TRUE'` AND NOT on prod server → Read remote via SSH

## Known Issues

### ✅ RESOLVED: ❌ Emoji Pattern Removed (2025-11-23)

**Previous Issue**: The logger was flagging ANY line containing `❌` emoji as critical, causing ~95% false positives.

**Examples of False Positives** (before removal):
- `❌ No matching action found for command "bottle"` - User input validation
- `❌ This navigation panel is for another player` - Access control working correctly
- `❌ User already claimed item at F4` - Game state validation

**Solution Implemented** (2025-11-23):
- **Removed** `line.includes('❌')` from pattern matching entirely
- Analysis showed ZERO unique error detection from ❌ emoji alone
- Every legitimate error containing ❌ was already caught by other patterns:
  - Errors using `console.error()` → Automatically posted via stderr
  - Errors with text like "Failed", "ERROR", "TypeError" → Pattern matched

**Impact**:
- ✅ **95% reduction in false positives**
- ✅ Error channel now shows only real errors
- ✅ No loss of error detection capability
- ✅ Eliminated alert fatigue from constant false alarms

**Key Insight**: The ❌ emoji is a user-facing UI indicator, not a system error indicator. Real errors use descriptive text and proper logging channels.

## Technical Design

### Class Structure

```javascript
export class PM2ErrorLogger {
  constructor(client)
  isRunningOnProdServer()
  loadPositions()
  savePositions(positions)
  async readLogsLocal(config, positions)
  async readLogsRemote(config, positions)
  start()
  stop()
  async checkLogs()
}
```

### Singleton Pattern

```javascript
let pm2LoggerInstance = null;

export const getPM2ErrorLogger = (client) => {
  if (!pm2LoggerInstance && client) {
    pm2LoggerInstance = new PM2ErrorLogger(client);
  }
  return pm2LoggerInstance;
};
```

### State Management

```javascript
// Global state (survives function calls, cleared on restart)
let monitoringState = {
  interval: null,  // setInterval reference
  positions: {
    dev: { out: 0, error: 0 },
    prod: { out: 0, error: 0 }
  }
};
```

## Monitoring Dashboard Integration

The PM2 Error Logger complements the Ultrathink health monitoring system (see [ProductionMonitoring.md](../infrastructure-security/ProductionMonitoring.md)):

- **PM2 Error Logger**: Real-time error detection and alerting (60s interval)
- **Ultrathink Monitor**: Comprehensive health scoring and metrics
- **CLI Monitoring**: Manual production health checks (`npm run monitor-prod`)

## Related Documentation

- [ProductionMonitoring.md](../infrastructure-security/ProductionMonitoring.md) - Full production monitoring system
- [ReactionRoleSystem.md](ReactionRoleSystem.md) - Source of false positive debug logs
- [InfrastructureArchitecture.md](../infrastructure-security/InfrastructureArchitecture.md) - PM2 and deployment context

---

**Last Updated**: 2026-08-04 (severity tiers + battle-stations ping)
**Component Status**: ✅ Active
