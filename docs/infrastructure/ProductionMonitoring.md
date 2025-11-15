# CastBot Production Monitoring Guide

## Overview

CastBot includes comprehensive production monitoring tools that provide real-time health insights, performance metrics, and alert conditions. This guide documents all monitoring capabilities and usage patterns.

## 🎯 Ultrathink Production Health Monitor

CastBot provides **two complementary monitoring interfaces**:

1. **📱 Discord Health Monitor** - Interactive monitoring within Discord channels
2. **🖥️ CLI Health Monitor** - Command-line tools for detailed analysis

### Discord Health Monitor Features

- **🔘 Interactive buttons** - Manual health checks via Discord UI
- **⏰ Scheduled monitoring** - Automated health reports at configurable intervals
- **🚨 Smart pings** - Alerts only for CRITICAL status (<50 health score)
- **🎨 Environment-aware** - Shows `Dev` or `Prod` with appropriate bot emoji
- **📊 Components V2 UI** - Rich formatted health displays

#### Quick Access
- **Manual Check**: Click "Ultramonitor" button in `/menu` → Analytics
- **Schedule**: Click "Schedule" button to set automated intervals
- **Configure**: Modal allows 1-minute to 24-hour intervals

### CLI Health Monitor Features

- **Real-time health scoring** (0-100 scale with color-coded status)
- **Component health breakdown** (Memory, Performance, Stability)
- **Intelligent alert system** with actionable recommendations
- **System resource tracking** with actual totals (not just percentages)
- **Memory optimization tracking** (cache limits, I/O reduction)

### Available Commands

```bash
# Full health dashboard with comprehensive metrics
npm run monitor-prod

# Quick essential metrics (fastest, for frequent checks)
npm run monitor-prod-quick

# Memory-focused analysis with optimization tracking
npm run monitor-prod-memory

# Alert conditions and recommendations
npm run monitor-prod-alerts

# Cache performance and optimization status
npm run monitor-prod-cache
```

## 🏗️ Discord Health Monitor Technical Architecture

### Implementation Pattern

The Discord Health Monitor uses **Safari's webhook pattern** for reliable scheduled posting:

```javascript
// ✅ CORRECT: Webhook pattern (works in scheduled context)
const webhook = await channel.createWebhook({name: 'Health Monitor'});
await fetch(webhook.url, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    flags: (1 << 15), // IS_COMPONENTS_V2
    components: [/* Plain Components V2 objects */]
  })
});

// ❌ WRONG: Discord.js builders (fail in scheduled context)
const actionRow = new ActionRowBuilder().addComponents(button);
await channel.send({components: [actionRow]});
```

### Key Technical Decisions

1. **Webhook over channel.send()** - Required for scheduled execution (setInterval context)
2. **Plain Components V2 objects** - No Discord.js builders (`ActionRowBuilder`, `ButtonBuilder`)
3. **No content field with IS_COMPONENTS_V2** - Discord webhooks reject this combination
4. **Singleton pattern** - Prevents multiple monitoring tasks
5. **Circuit breaker** - Auto-disables after 5 consecutive errors

### File Architecture

```
/src/monitoring/
├── healthMonitor.js          # Core monitoring class
└── /scripts/                 # CLI monitoring tools
    ├── monitor-prod.js
    ├── monitor-prod-quick.js
    └── monitor-prod-memory.js
```

### Integration Points

- **ButtonHandlerFactory**: `prod_ultrathink_monitor` handler
- **Modal System**: `health_monitor_schedule_modal` for configuration
- **PM2 Integration**: Production metrics via `pm2 jlist`
- **Environment Detection**: `process.env.PRODUCTION === 'TRUE'`

### Related Documentation

- **RaP #0998**: [Scheduling Architecture Analysis](../RaP/0998_20250927_Scheduling_Architecture_Analysis.md)
- **Components V2**: [Components V2 Standards](../standards/ComponentsV2.md)
- **Button Patterns**: [ButtonHandlerFactory](../enablers/ButtonHandlerFactory.md)

## 📊 Health Scoring System

### Overall Health Score (0-100)

The overall health score is a weighted average:
- **Memory Health (40%)**: Bot memory usage vs thresholds
- **Performance (30%)**: CPU usage and response times
- **Stability (30%)**: Restart frequency and error rates

### Score Interpretation

| Score Range | Status | Color | Discord Ping | Action Required |
|-------------|---------|-------|--------------|-----------------|
| 90-100 | 🟢 EXCELLENT | Green | No | None - optimal performance |
| 75-89 | 🟡 GOOD | Yellow | No | Monitor trends |
| 50-74 | 🟠 WARNING | Orange | No | Investigation recommended |
| 0-49 | 🔴 CRITICAL | Red | **Yes** | Immediate intervention |

### Component Health Metrics

#### Memory Health
- **Excellent (100)**: <150MB usage
- **Good (75)**: 150-200MB usage
- **Warning (25)**: 200-250MB usage
- **Critical (0)**: >250MB usage

#### Performance Health
- **Excellent (100)**: <5% CPU usage
- **Good (75)**: 5-20% CPU usage
- **Warning (50)**: 20-50% CPU usage
- **Critical (0)**: >50% CPU usage

#### Stability Health
- **Excellent (100)**: <15 total restarts, minimal errors
- **Good (50)**: 15-20 total restarts
- **Warning (25)**: 20-25 total restarts
- **Critical (0)**: >25 total restarts

## 🤖 Bot Metrics Tracking

### Core Metrics

- **Memory Usage**: Current bot memory consumption (MB)
- **CPU Usage**: Current CPU utilization percentage
- **Uptime**: Time since last restart (formatted human-readable)
- **Total Restarts**: Cumulative restart count since deployment
- **Process ID**: Current process identifier
- **Status**: Online/offline status

### Memory Optimization Tracking

The monitor tracks the effectiveness of implemented optimizations:

```bash
🧠 MEMORY ANALYSIS:
   Bot Memory: 93MB
   Memory Trend: 🟢 Stable
   Cache Limits: ✅ Active (MessageManager:50, GuildMemberManager:1200, UserManager:300)
   File I/O: ✅ Server name caching active (98% reduction)
```

## 🖥️ System Metrics

### Enhanced Resource Display

Shows actual totals alongside percentages (matches Lightsail dashboard):

```bash
🖥️ SYSTEM METRICS:
   Memory Usage: 72% (321Mi/447Mi)
   Disk Usage: 48% (9G/20G)
   15:05:12 up 252 days, 23:59, 1 user, load average: 0.11, 0.04, 0.01
```

### Resource Interpretation

- **Memory**: Shows used/total in Mi (Mebibytes) matching system reporting
- **Disk**: Shows used/total in G (Gigabytes) for the root filesystem
- **Load Average**: 1, 5, and 15-minute system load averages

## ⚠️ Alert System

### Alert Categories

#### Critical Alerts
- **Bot Memory >250MB**: Immediate restart recommended
- **Bot Offline**: Immediate intervention required
- **System Memory >85%**: Memory crisis condition

#### Warning Alerts
- **High Restart Count**: >20 restarts indicates instability
- **System Memory 85%+**: Monitor for memory leaks

### Alert Format

```bash
⚠️ ALERTS & RECOMMENDATIONS:
   🔴 CRITICAL: Bot memory usage at 275MB (>250MB threshold)
   📋 Action: Consider immediate restart
```

## 📋 PM2 Error Logger

### Overview

The PM2 Error Logger provides automated monitoring of PM2 process logs with real-time error notifications posted directly to Discord. This system operates continuously in both dev and prod environments, ensuring no critical errors go unnoticed.

**Key Features:**
- **Automated Monitoring**: Checks PM2 logs every 60 seconds
- **Discord Integration**: Posts errors to #error channel (ID: 1416025517706186845)
- **Bulletproof Design**: Never crashes the bot - all errors isolated and logged
- **Dual-Mode Operation**: Local file reading (dev/prod server) or SSH remote monitoring
- **Smart Filtering**: Detects ERROR, FATAL, CRITICAL, failed, TypeError, and more
- **Position Tracking**: Remembers last-read position to avoid duplicate notifications
- **Environment Tags**: Clear 🟡 [PM2-DEV] or 🔴 [PM2-PROD] prefixes

### How It Works

#### Environment Detection

The system intelligently detects three scenarios:

1. **Dev Environment** (`PRODUCTION !== 'TRUE'`)
   - Reads local logs from `./logs/pm2-*.log`
   - Process name: `castbot-pm-dev`

2. **Production Server** (running ON prod server as bitnami user)
   - Reads local logs from `/home/bitnami/.pm2/logs/castbot-pm-*.log`
   - Process name: `castbot-pm`
   - Detection: Checks `os.userInfo().username === 'bitnami'` AND `/home/bitnami/.pm2/logs` exists

3. **Remote Monitoring** (`PRODUCTION === 'TRUE'` but NOT on prod server)
   - Uses SSH to read remote prod logs
   - Same error patterns and filtering
   - Requires SSH key at `~/.ssh/castbot-key.pem`

#### Error Pattern Detection

The logger filters for these critical patterns:

**Error Log (always monitored):**
- All content from `pm2-error.log`
- Last 50 lines per check

**Output Log (pattern-filtered):**
- `ERROR`, `FATAL`, `CRITICAL`
- `❌`, `failed`, `Failed`
- `Error:`, `TypeError`, `ReferenceError`, `SyntaxError`
- Last 30 critical lines per check

### Discord Integration

**Message Format:**
```
🟡 **[PM2-DEV]** 2:45 PM
```
=== ERRORS ===
[error log lines]

=== CRITICAL OUTPUT ===
[filtered output lines]
```
```

**Message Characteristics:**
- **Truncation**: Limited to 1900 chars (100 char buffer from 2000 limit)
- **Timestamps**: Human-readable format (2:45 PM)
- **Environment Tags**:
  - 🟡 `[PM2-DEV]` for development
  - 🔴 `[PM2-PROD]` for production
- **Code Blocks**: Uses triple backticks for log formatting

### Technical Implementation

#### File Architecture

```
/src/monitoring/pm2ErrorLogger.js    # Main implementation (292 lines)
/logs/pm2-positions.json              # Position tracking (dev)
/home/bitnami/.pm2/logs/              # Production logs
```

#### Key Classes and Methods

```javascript
class PM2ErrorLogger {
  constructor(client)              // Initialize with Discord client
  isRunningOnProdServer()          // Detect prod server environment
  loadPositions()                  // Load file position tracking
  savePositions(positions)         // Save file position tracking
  readLogsLocal(config, positions) // Read local PM2 logs
  readLogsRemote(config, positions)// Read remote logs via SSH
  start()                          // Start monitoring (60s interval)
  stop()                           // Stop monitoring
  checkLogs()                      // Check logs and post to Discord
}

export const getPM2ErrorLogger = (client) => { /* Singleton */ }
```

#### Integration Point

In `app.js`:
```javascript
import { getPM2ErrorLogger } from './src/monitoring/pm2ErrorLogger.js';

// Start PM2 Error Log Monitoring (Dev & Prod)
const pm2Logger = getPM2ErrorLogger(client);
pm2Logger.start();
```

### Configuration

**PM2 Log Paths:**
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
    local: false  // Overridden if running on prod server
  }
};
```

**Timing Configuration:**
- Check interval: 60 seconds (`PM2_LOG_CHECK_INTERVAL`)
- Discord channel: `1416025517706186845` (hardcoded)

### Monitoring Status

#### Verify Operation

Check console logs for startup confirmation:
```bash
[PM2Logger] 📋 Starting PM2 Discord logger...
[PM2Logger] ✅ PM2 Discord logger started - posting to #error channel every 60s
```

#### Check Activity

Monitor for successful posts:
```bash
[PM2Logger] Check: env=prod, isOnProdServer=true, shouldReadLocal=true
[PM2Logger] 📋 PM2 logs posted to Discord (3 lines)
```

#### Verify Discord Channel

Navigate to #error channel to see posted errors with environment tags.

### Error Handling Philosophy

**Bulletproof Architecture:**
- **Never crashes the bot** - All errors caught and logged
- **Isolated intervals** - Each check wrapped in try/catch
- **Silent failures** - SSH errors logged but don't break monitoring
- **Graceful degradation** - Missing logs don't stop other checks

**Error Isolation Example:**
```javascript
async checkLogs() {
  try {
    // Main logic
  } catch (error) {
    console.error('[PM2Logger] Log check error (non-critical):', error);
    // Don't throw - this should never break the bot
  }
}
```

### Historical Context

**Restoration Background:**
- Originally implemented in commit `92b16c0`
- Accidentally lost during development
- Restored January 2025 with production improvements
- Enhanced with `isRunningOnProdServer()` detection to prevent SSH-to-self issues

**Before Restoration:**
```
❌ PM2 errors only visible in logs
❌ Manual SSH required to check production errors
❌ No real-time error notifications
```

**After Restoration:**
```
✅ Real-time Discord notifications every 60s
✅ Smart environment detection (dev/prod/remote)
✅ Automatic filtering of critical patterns
✅ Position tracking prevents duplicates
✅ Bulletproof design never crashes bot
```

### Related Documentation

- [Infrastructure Architecture](InfrastructureArchitecture.md) - Deployment and environment setup
- [Logging Standards](../standards/LoggingStandards.md) - Log format conventions
- PM2 Configuration: `ecosystem.config.cjs` (dev), production uses PM2 saved state

### Troubleshooting

**Issue**: No errors posted to Discord
- **Check**: Console logs for `[PM2Logger]` startup message
- **Check**: PM2 log files exist and contain errors
- **Check**: Discord channel ID is correct (1416025517706186845)

**Issue**: SSH permission errors in production
- **Cause**: Running on prod server but trying to SSH to itself
- **Fix**: Already resolved - `isRunningOnProdServer()` detects this scenario
- **Verify**: Check logs for `isOnProdServer=true, shouldReadLocal=true`

**Issue**: Duplicate error messages
- **Cause**: Position tracking file corrupted or deleted
- **Fix**: Delete `./logs/pm2-positions.json` to reset tracking

## 🗄️ Cache Performance Monitoring

### Cache Optimization Status

The monitor tracks all implemented cache optimizations:

```bash
🗄️ CACHE PERFORMANCE:
   Cache Limits: ✅ Active (MessageManager:50, GuildMemberManager:1200, UserManager:300)
   Server Name Caching: ✅ Active (98% I/O reduction)
   Request Cache: ✅ Clearing between interactions
```

### Cache Metrics

- **Discord.js Cache Limits**: Prevents unbounded memory growth
- **Server Name Caching**: Eliminates 739KB file reads per interaction
- **Request Cache**: Automatic clearing between interactions

## 💡 Usage Patterns

### Routine Monitoring

```bash
# Daily health check
npm run monitor-prod-quick

# Weekly comprehensive review
npm run monitor-prod

# During performance issues
npm run monitor-prod-memory
npm run monitor-prod-alerts
```

### Troubleshooting Workflow

1. **Quick Status**: `npm run monitor-prod-quick`
2. **If issues detected**: `npm run monitor-prod-alerts`
3. **Memory problems**: `npm run monitor-prod-memory`
4. **Full analysis**: `npm run monitor-prod`

## 🔧 Technical Implementation

### SSH Integration

Uses existing SSH framework for seamless integration:
- Same SSH keys and configuration as deployment scripts
- Consistent error handling and connection management
- Parallel metric gathering for optimal performance

### Data Sources

- **PM2 Process Manager**: Bot metrics and status
- **System Commands**: `free -h`, `df -h`, `uptime`
- **SSH Execution**: Remote command execution via established framework

### Performance Characteristics

- **Quick Mode**: ~2-3 seconds (essential metrics only)
- **Full Mode**: ~5-7 seconds (comprehensive analysis)
- **Memory Mode**: ~4-5 seconds (includes optimization tracking)

## 📈 Historical Context

### Memory Crisis Resolution

The monitoring system was developed following a critical memory crisis:

**Before Optimization (Crisis State)**:
```
Memory Usage: 273MB (94% heap)
Event Loop: 67ms latency
HTTP P95: 2,957ms
Status: Critical intervention required
```

**After Optimization (Current State)**:
```
Memory Usage: 93MB (stable/decreasing)
Event Loop: <1ms latency
HTTP P95: <200ms
Status: Excellent performance
```

### Optimization Tracking

The monitor validates these implemented optimizations:

1. **Server Name Caching**: 98% reduction in file I/O operations
2. **Discord.js Cache Limits**: Prevention of unbounded cache growth
3. **Environment-Specific Analytics**: Improved dev/prod separation

## 🔗 Related Documentation

- [Infrastructure Architecture](InfrastructureArchitecture.md)
- [Performance Debugging Guide](../troubleshooting/PerformanceDebugging.md)
- [Cache Management Guide](../features/CacheManagement.md)
- [Analytics System](Analytics.md)

## 📋 Monitoring Checklist

### Daily Checks
- [ ] Overall health score >90
- [ ] Memory usage <150MB
- [ ] No critical alerts
- [ ] Bot status online

### Weekly Reviews
- [ ] Memory trend analysis
- [ ] Restart frequency review
- [ ] System resource utilization
- [ ] Cache effectiveness metrics

### Monthly Analysis
- [ ] Historical performance trends
- [ ] Alert pattern analysis
- [ ] Optimization effectiveness review
- [ ] Infrastructure scaling needs

---

*Last Updated: 2025-01-22 - Initial monitoring system documentation*