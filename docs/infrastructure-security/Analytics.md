# CastBot Analytics & Logging System

## Overview

CastBot includes a comprehensive analytics and logging system that tracks user interactions, server usage, and provides detailed insights into how the bot is being used across Discord servers. The system has evolved into a sophisticated multi-component architecture with real-time monitoring, advanced server analytics, and intelligent feature usage detection.

## System Architecture

### 1. Analytics Logger (`src/analytics/analyticsLogger.js`)
The core module that handles all interaction logging with the following features:
- **User Interaction Tracking**: Commands, buttons, selects, modals across all environments
- **Structured Logging**: File-based logging with configurable format and timestamps
- **Live Discord Integration**: Real-time posting to environment-specific channels
- **Environment-Specific Exclusions**: Separate user filtering for production vs development
- **Performance Optimizations**: Server name caching, rate limiting, non-blocking operations
- **Legacy Compatibility**: Automatic migration from old configuration formats

### 2. Server Usage Analytics (`src/analytics/serverUsageAnalytics.js`)
Advanced server-by-server usage analysis system providing:
- **42-day activity analysis** with configurable time windows
- **Server ranking by interaction count** with medal emojis
- **Traffic light activity system** (🟢 recent, 🟠 moderate, 🔴 inactive)
- **Intelligent feature usage detection** across all CastBot features
- **Server install tracking** with timestamp and owner information
- **Components V2 UI** with professional formatting and refresh functionality

### 3. Live Discord Logging
Real-time posting of analytics events to Discord channels with environment-specific configuration:

#### Environment-Specific Channels
- **Production**: 1385059476243218552 (#🪵logs)
- **Development**: 1386998800215969904 (#🪵logs-dev)

#### Advanced Features
- **Environment-specific user exclusions** for testing vs production
- **Server name caching** to eliminate 739KB file reads per interaction
- **Rate limiting** (1.2 second delay between posts) to prevent Discord API abuse
- **Markdown formatted messages** with timestamps and user context
- **Non-blocking error handling** to prevent main bot disruption
- **Backwards compatibility** with legacy configuration formats

## Configuration Management

### Environment-Specific Configuration

The analytics system supports different configurations for development and production environments:

```javascript
// New environment-specific exclusion format
excludedUserIds: {
  production: ["391415444084490240"],  // Exclude admin in production
  development: []                      // Allow all users in development for testing
}

// Legacy format (auto-migrated)
excludedUserIds: ["391415444084490240"]  // Applied to both environments
```

### Configuration Tools

- **Toggle Script**: `scripts/utilities/toggle-live-logging.js`
  - `node toggle-live-logging.js enable` - Enable live Discord logging
  - `node toggle-live-logging.js disable` - Disable live Discord logging
  - `node toggle-live-logging.js exclude <userID>` - Toggle user exclusion (environment-specific)

- **Production Button**: `prod_toggle_live_analytics` - Toggle live logging via Discord UI

### Performance Optimizations

#### Server Name Caching (Added 2025-01-22)
To eliminate 739KB file reads per interaction, server names are cached in memory:

```javascript
// Cache implementation in analyticsLogger.js
const serverNameCache = new Map();

// Only read playerData.json once per server, then cache
if (!serverNameCache.has(guildId)) {
  const serverName = playerData[guildId]?.serverName || 'Unknown Server';
  serverNameCache.set(guildId, serverName);
}
```

**Impact**: ~98% reduction in file I/O operations for analytics logging.

## Server Usage Analytics System (Detailed)

### Core Features

#### Traffic Light Activity System
Servers are categorized by activity level using visual indicators:
- **🟢 Recent**: One or more interactions within the last 24 hours
- **🟠 Moderate**: One or more interactions within the last 4 days (inclusive)
- **🔴 Inactive**: No interactions within the last 4 days

```javascript
// Implementation in calculateActivityLevel function
function calculateActivityLevel(lastActivityTimestamp) {
  const now = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const FOUR_DAYS = 4 * 24 * 60 * 60 * 1000;
  const timeDiff = now - lastActivityTimestamp;
  
  if (timeDiff <= TWENTY_FOUR_HOURS) {
    return { emoji: '🟢', level: 'recent', description: 'Active within 24 hours' };
  } else if (timeDiff <= FOUR_DAYS) {
    return { emoji: '🟠', level: 'moderate', description: 'Active within 4 days' };
  } else {
    return { emoji: '🔴', level: 'inactive', description: 'Inactive for more than 4 days' };
  }
}
```

#### Feature Usage Detection
The system intelligently detects usage of specific CastBot features by analyzing log patterns:

**Supported Features:**
- **🖼️ Castlist**: `/castlist` commands and `show_castlist*` buttons
- **📝 Season Applications**: Application button clicks and modals
- **🦁 Safari**: All safari-related interactions (movement, attacks, items, etc.)
- **🏆 Cast Ranking**: Ranking button interactions
- **💜 React for Roles (R4R)**: Role reaction system usage
- **😀 Player Emojis**: Custom emoji creation and management
- **✨ Vanity Roles**: Custom role features

```javascript
// Feature detection logic
function detectFeatureUsage(entries) {
  const features = {
    castlist: 0, seasonApplications: 0, safari: 0,
    castRanking: 0, reactForRoles: 0, playerEmojis: 0, vanityRoles: 0
  };
  
  for (const entry of entries) {
    const detail = entry.actionDetail.toLowerCase();
    const customId = entry.rawLine.match(/\(([^)]+)\)$/)?.[1] || '';
    
    // Castlist detection
    if (entry.actionType === 'SLASH_COMMAND' && detail.includes('/castlist')) {
      features.castlist++;
    } else if (customId.includes('show_castlist')) {
      features.castlist++;
    }
    
    // Safari detection - comprehensive pattern matching
    if (customId.includes('safari_') || 
        entry.actionType.startsWith('SAFARI_') ||
        customId.includes('location_') ||
        customId.includes('attack_') ||
        customId.includes('item_')) {
      features.safari++;
    }
    
    // Additional feature detection patterns...
  }
  return features;
}
```

#### Server Install Tracking
Monitors new server installations with detailed metadata:
- Installation timestamp with timezone handling
- Server owner information (display name and username)
- Server name and ID correlation
- Chronological sorting (newest first)

### Log Parsing System

#### Multi-Format Support
The system handles multiple log formats for backward compatibility:

**Current Format (5-part):**
```
[12:34PM] Wed 10 Aug 25 | #general | UserName (@username) (ID) in ServerName (ServerID) | ACTION_TYPE | detail
```

**Legacy Format (4-part):**
```
[12:34PM] Wed 10 Aug 25 | UserName (@username) (ID) in ServerName (ServerID) | ACTION_TYPE | detail
```

**Server Install Format:**
```
2025-08-10T04:17:27.123Z | SERVER_INSTALL | ServerName (ServerID) | Owner: DisplayName (@username) (OwnerID)
```

#### Safari Action Normalization
Special handling for Safari system actions to maintain consistency:
```javascript
// Safari actions are normalized to BUTTON_CLICK for analysis
const safariActions = [
  'SAFARI_MOVE', 'SAFARI_ATTACK', 'SAFARI_ITEM_USE',
  'SAFARI_ITEM_PICKUP', 'SAFARI_CURRENCY', 'SAFARI_WHISPER', 'SAFARI_TEST'
];

if (safariActions.includes(normalizedActionType)) {
  normalizedActionType = 'BUTTON_CLICK';
}
```

## UI Implementation (Components V2)

### Layout Structure
The analytics display uses Discord's Components V2 architecture for professional presentation:

```javascript
// Main container with accent color
{
  type: 17, // Container
  accent_color: 0xFF0000, // Red accent bar
  components: [
    {
      type: 10, // Text Display
      content: fullContent // All analytics content
    },
    {
      type: 14, // Separator
      divider: true,
      spacing: 1
    },
    {
      type: 1, // Action Row
      components: [{
        type: 2, // Button
        style: 4, // Danger (red)
        emoji: { name: '📈' },
        label: 'Refresh Stats',
        custom_id: 'prod_server_usage_stats'
      }]
    }
  ]
}
```

### Section Organization
The analytics display is organized into three main sections with markdown separators:

1. **> ## 🆕 Most Recent Server Installs** (Latest 3-5)
2. **> ## 🏆 Server Rankings** (Top servers by interaction count)
3. **> ## 📈 Server Usage Analytics** (Summary statistics)

### Content Formatting
- **Code tick formatting** for server headers: `` `🥇 ServerName: 999 interactions 🟢` ``
- **Compact feature display**: `🖼️ castlist (x70) • 🦁 safari (x3379)`
- **Activity timestamps**: `Last Activity: [12:38PM] Sun 10 Aug 25 | Username`
- **Server install format**: `📅 **ServerName** ([12:17 PM] Sun Aug 10, Owner (@username))`

## Data Storage & Log Formats

### Primary Log File
**Location**: `/logs/user-analytics.log`
**Format**: Append-only text file with structured entries
**Rotation**: Manual (should be automated in future)

### Log Entry Structure
```
[timestamp] [location] | user_info | server_info | ACTION_TYPE | action_detail
```

**Components:**
- **Timestamp**: `[HH:MMAM/PM] Day DD Mon YY` format
- **Location**: Channel reference (optional, in 5-part format)
- **User Info**: `DisplayName (@username) (UserID)`
- **Server Info**: `in ServerName (ServerID)`
- **Action Type**: `SLASH_COMMAND`, `BUTTON_CLICK`, `SELECT_MENU`, `MODAL_SUBMIT`, `SERVER_INSTALL`
- **Action Detail**: Command name, button ID, or other interaction identifier

### Configuration Storage
Analytics configuration is stored in `playerData.json`:
```json
{
  "environmentConfig": {
    "liveDiscordLogging": {
      "enabled": true,
      "channelId": "1385059476243218552",
      "excludedUsers": ["391415444084490240"]
    }
  }
}
```

## Access Control & Security

### User Restrictions
Server usage analytics are restricted to specific user IDs for security:
```javascript
const AUTHORIZED_USER_IDS = ['391415444084490240']; // Reece only
```

### Data Privacy
- No message content is logged
- Only interaction metadata is stored  
- User IDs can be excluded from logging
- Guild-specific data remains contextual

### Rate Limiting
- Discord logging: 1.2 second delays between posts
- File I/O: Asynchronous append operations
- Error isolation: Logging failures don't affect bot functionality

## Performance Optimizations

### Character Limit Management
The system dynamically truncates content to fit Discord's 4000-character limit:
```javascript
// Optimal server display calculation
function calculateOptimalServerLimit(rankedServers) {
  const SAFETY_BUFFER = 800;
  const MAX_CHARS = 4000;
  
  let totalLength = baseContentLength;
  let displayServers = [];
  
  for (const server of rankedServers) {
    const estimatedServerLength = calculateServerDisplayLength(server);
    if (totalLength + estimatedServerLength > MAX_CHARS - SAFETY_BUFFER) {
      break;
    }
    displayServers.push(server);
    totalLength += estimatedServerLength;
  }
  
  return { displayServers, hasMore: displayServers.length < rankedServers.length };
}
```

### Memory Management
- Streaming log parsing for large files
- Limited result sets (top servers only)
- Efficient timestamp parsing and caching

## Admin Interface & Commands

### Production Menu Integration
Access path: `/menu` → Analytics → Server Stats
- Restricted to authorized users
- Ephemeral responses for security
- Refresh button for real-time updates

### Command-Line Tools
**Live Logging Management:**
```bash
node toggle-live-logging.js on        # Enable live logging
node toggle-live-logging.js off       # Disable live logging
node toggle-live-logging.js exclude <discordId>  # Toggle user exclusion
```

## Analytics Output Examples

### Server Ranking Display
```
> ## 🏆 Server Rankings

`🥇 EmeraldORG: Fire Emblem T...: 8,042 interactions 🟢`
   └ 38 users • 🖼️ castlist (x70) • 📝 szn apps (x22) • 🦁 safari (x3379) • 🏆 ranking (x3) • ✨ vanity roles (x2)
   └ Last Activity: [12:38PM] Sun 10 Aug 25 | Smiles

`🥈 CastBot Regression S: 413 interactions 🟠`
   └ 2 users • 🦁 safari (x570)
   └ Last Activity: [11:59AM] Sun 10 Aug 25 | Reece
```

### Server Install Tracking
```
> ## 🆕 Most Recent Server Installs (Latest 3)

📅 **EpochORG S4: Ancient Egypt** ([12:17 PM] Sun Aug 10, Mike (@mpschettig))

📅 **Another Test Server** ([12:15 PM] Sun Aug 10, Another User (@anotheruser))

📅 **Test Server Name** ([12:10 PM] Sun Aug 10, TestUser (@testuser))
```

### Summary Statistics
```
> ## 📈 Server Usage Analytics

📊 **Total Interactions**: 1,477
👥 **Unique Users**: 9
🏰 **Active Servers**: 9
⏱️ **Period**: Last 42 days
📈 **Showing**: Top 9 of 9 servers
```

## Integration Guide

### Adding Analytics to New Features
```javascript
// Import the analytics logger
const { logInteraction } = require('../analytics/analyticsLogger.js');

// Log user interactions
async function handleNewFeatureButton(interaction) {
  try {
    // Log the interaction
    await logInteraction(
      interaction.guild?.id, 
      interaction.user.id, 
      'BUTTON_CLICK', 
      'new_feature_button'
    );
    
    // Handle the feature logic
    const result = await processNewFeature(interaction);
    
    // Success logging (optional)
    console.log(`✅ New feature processed for user ${interaction.user.id}`);
    
  } catch (error) {
    console.error('❌ Failed to process new feature:', error);
    // Error handling...
  }
}
```

### Adding Feature Detection
To add detection for new features, update the `detectFeatureUsage` function:
```javascript
// Add new feature detection in detectFeatureUsage function
if (customId.includes('new_feature_') || detail.includes('new feature')) {
  features.newFeature++;
}
```

### Server Install Logging
For new server installation events:
```javascript
const { logNewServerInstall } = require('../analytics/analyticsLogger.js');

// When bot joins a new guild
client.on('guildCreate', async (guild) => {
  await logNewServerInstall(guild);
});
```

## Troubleshooting

### Common Issues

**1. Analytics Not Loading**
- Check if analytics log file exists at `/logs/user-analytics.log`
- Verify user has permission to access analytics
- Check for parsing errors in console logs

**2. Missing Server Data**
- Ensure live logging is enabled
- Check if user is in exclusion list
- Verify log format matches expected patterns

**3. Feature Detection Inaccurate**
- Review custom ID patterns for new features
- Check if Safari action normalization is working
- Verify timestamp parsing for activity calculations

**4. UI Display Issues**
- Check Components V2 flag is set correctly
- Verify character limits aren't being exceeded
- Ensure markdown formatting is valid

### Debug Mode
Enable verbose logging in analytics files:
```javascript
const DEBUG_ANALYTICS = process.env.NODE_ENV !== 'production';

if (DEBUG_ANALYTICS) {
  console.log('📊 DEBUG: Analytics processing...', data);
}
```

### Performance Monitoring
Monitor analytics performance:
```bash
# Check log file size
ls -lh /logs/user-analytics.log

# Monitor real-time logging
tail -f /logs/user-analytics.log

# Check processing times
grep "📊 DEBUG" pm2-logs | tail -20
```

## Future Enhancements

### Phase 2: Enhanced Analytics
- **Time-based filtering**: Hourly, daily, weekly views
- **Comparative analysis**: Server growth trends
- **Advanced visualizations**: Charts and graphs
- **Export capabilities**: CSV, JSON data export
- **Automated reporting**: Scheduled analytics summaries

### Phase 3: AI-Powered Insights
- **Predictive analytics**: Server growth forecasting
- **Anomaly detection**: Unusual activity patterns
- **User journey analysis**: Feature adoption tracking
- **A/B testing framework**: Feature experimentation
- **Custom dashboard**: Web-based analytics interface

### Phase 4: Real-Time Analytics
- **Live dashboards**: Real-time server monitoring
- **Alert systems**: Activity threshold notifications
- **Stream processing**: Real-time feature detection
- **Geographic analytics**: Server location insights
- **Performance correlation**: Bot performance vs usage

## Maintenance Guidelines

### Log Rotation
Implement automated log rotation:
```bash
# Recommended logrotate configuration
/logs/user-analytics.log {
    daily
    rotate 90
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

### Data Retention Policy
- **Active data**: 90 days in primary log
- **Archive data**: 1 year in compressed format
- **Summary data**: Permanent retention for trends
- **Privacy compliance**: Automated purging of user data on request

### Monitoring & Alerts
Set up monitoring for:
- Log file growth rate
- Analytics processing errors
- Discord API rate limits
- Memory usage during analytics generation

## Related Documentation

- [LoggingStandards.md](../standards/LoggingStandards.md) - General logging patterns and utilities
- [ComponentsV2.md](../standards/ComponentsV2.md) - Discord UI architecture requirements
- [ButtonHandlerFactory.md](ButtonHandlerFactory.md) - Button implementation patterns
- [DefinitionOfDone.md](../workflow/DefinitionOfDone.md) - Analytics requirements for new features

## Migration Notes for Future Development

When working with the analytics system:

1. **Always test log parsing** with both legacy and current formats
2. **Verify Components V2 compatibility** for UI changes
3. **Test character limit handling** with large server lists
4. **Validate feature detection patterns** before deployment
5. **Monitor performance impact** of new analytics features
6. **Document any new log formats** in this file
7. **Update feature detection logic** when adding new bot features

The analytics system is designed to be extensible and maintainable. Any changes should preserve backward compatibility and follow the established patterns documented here.