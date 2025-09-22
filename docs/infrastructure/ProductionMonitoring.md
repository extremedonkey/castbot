# CastBot Production Monitoring Guide

## Overview

CastBot includes comprehensive production monitoring tools that provide real-time health insights, performance metrics, and alert conditions. This guide documents all monitoring capabilities and usage patterns.

## 🎯 Ultrathink Production Health Monitor

### Core Features

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

## 📊 Health Scoring System

### Overall Health Score (0-100)

The overall health score is a weighted average:
- **Memory Health (40%)**: Bot memory usage vs thresholds
- **Performance (30%)**: CPU usage and response times
- **Stability (30%)**: Restart frequency and error rates

### Score Interpretation

| Score Range | Status | Color | Action Required |
|-------------|---------|-------|-----------------|
| 90-100 | 🟢 EXCELLENT | Green | None - optimal performance |
| 75-89 | 🟡 GOOD | Yellow | Monitor trends |
| 50-74 | 🟠 WARNING | Orange | Investigation recommended |
| 0-49 | 🔴 CRITICAL | Red | Immediate intervention |

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
- [Cache Management Guide](../architecture/CacheManagement.md)
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